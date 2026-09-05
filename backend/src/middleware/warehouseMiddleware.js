import { query } from '../config/database.js';
import { isKnownRole, canAccessAllOutlets } from '../utils/roleAccess.js';

// Warehouse Admin is an all-outlet role too (canAccessAllOutlets(roleName)
// is true for it), but it gets its own narrower branch below (Central
// Warehouse locations only) rather than the unrestricted "sees every
// location" access every other all-outlet role gets - so it's excluded here
// and checked separately.
// This used to be a separately-maintained ['Super Admin', 'Admin',
// 'Developer'] list, narrower than roleAccess.js's ALL_OUTLET_ROLES -
// Central Kitchen Admin (explicit locations.can_view=1) and Viewer/Viewer
// Auditor (retains locations.can_view=1 via its blanket view-only sweep)
// both have real view permission on locations but were wrongly 403'd here
// because they aren't Super Admin/Admin/Developer and have no outlet_ids.
const isFullAccessRole = (roleName) => canAccessAllOutlets(roleName) && roleName !== 'Warehouse Admin';

export const applyLocationScope = async (req, res, next) => {
  try {
    const roleName = req.user.role_name;
    const requestedLocationId = req.query.location_id || req.body.location_id || req.params.location_id;

    if (!isKnownRole(roleName)) {
      return res.status(403).json({ success: false, message: 'Unknown role is not authorized' });
    }

    let allowedLocationIds = [];
    let all = false;

    if (isFullAccessRole(roleName)) {
      all = true;
    } else if (roleName === 'Warehouse Admin') {
      const rows = await query("SELECT id FROM locations WHERE location_type = 'Central Warehouse' AND is_active = 1");
      allowedLocationIds = rows.map((r) => Number(r.id));
    } else {
      const assignedOutletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
      if (assignedOutletIds.length === 0) {
        return res.status(403).json({ success: false, message: 'No inventory location assigned to this user' });
      }
      const rows = await query("SELECT id, outlet_id FROM locations WHERE outlet_id IN (?) AND is_active = 1", [assignedOutletIds]);
      allowedLocationIds = rows.map((r) => Number(r.id));
    }

    // Validate requested primary location is a Central Warehouse for warehouse module
    if (requestedLocationId && requestedLocationId !== 'all') {
      const locRows = await query("SELECT id, location_type FROM locations WHERE id = ? AND is_active = 1", [Number(requestedLocationId)]);
      if (locRows.length === 0 || locRows[0].location_type !== 'Central Warehouse') {
        return res.status(403).json({ success: false, message: 'Central Warehouse required for warehouse operations' });
      }

      // A GET request for the Central Warehouse itself is allowed for any
      // role that already passed checkPermission's can_view gate on the
      // calling module, even if their location scope would otherwise be
      // their own outlet - e.g. an Outlet Admin checking current warehouse
      // stock/ledger before raising a requisition. Writes (GRN, adjustments,
      // etc.) still require the outlet-ownership checks below, since those
      // routes gate on can_create/can_edit which Outlet Admin isn't granted
      // on warehouse modules in the first place.
      if (req.method === 'GET' && !all) {
        req.locationScope = { all: false, locationIds: [Number(requestedLocationId)], requestedLocationId: Number(requestedLocationId) };
        return next();
      }
    }

    if (all) {
      req.locationScope = { all: true, locationIds: [], requestedLocationId: requestedLocationId || 'all' };
      return next();
    }

    if (requestedLocationId && requestedLocationId !== 'all' && !allowedLocationIds.includes(Number(requestedLocationId))) {
      return res.status(403).json({ success: false, message: 'You do not have access to the requested location' });
    }

    req.locationScope = {
      all: false,
      locationIds: allowedLocationIds,
      requestedLocationId: Number(requestedLocationId) || allowedLocationIds[0] || null,
    };
    next();
  } catch (error) {
    console.error('Location scope error:', error);
    return res.status(500).json({ success: false, message: 'Error checking location access' });
  }
};

// Direct, awaitable version of the same access rule checkLocationAccess
// enforces - for routes where the relevant location isn't a URL/body param
// (e.g. POST /grn/:id/post, where :id is the GRN's own id, not a location),
// so the record must be loaded first and its location checked explicitly
// rather than via the middleware's param-name guessing.
export const isLocationAccessible = async (user, locationId) => {
  if (!locationId) return false;
  const roleName = user.role_name;
  if (isFullAccessRole(roleName)) return true;
  if (roleName === 'Warehouse Admin') {
    const rows = await query("SELECT id FROM locations WHERE id = ? AND location_type = 'Central Warehouse' AND is_active = 1", [locationId]);
    return rows.length > 0;
  }
  const assignedOutletIds = (user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
  if (assignedOutletIds.length === 0) return false;
  const rows = await query("SELECT id FROM locations WHERE id = ? AND outlet_id IN (?) AND is_active = 1", [locationId, assignedOutletIds]);
  return rows.length > 0;
};

// For a single-location filter/param the client is requesting (e.g. a
// ?location_id= on a list endpoint): validates it against req.locationScope
// (set by applyLocationScope) and returns the id to actually use.
// - Full access (scope.all): returns the requested id as-is (Number(id) or
//   null if none given), since these roles aren't restricted to any set of
//   locations.
// - Scoped roles: 403s (and returns undefined) if the requested id is
//   outside their allowed locations; otherwise returns it. If none was
//   requested, defaults to the scope's own resolved location instead of
//   silently falling through to "no filter" (which would leak every
//   location's data), matching how /dashboard and /stock already default to
//   req.locationScope.requestedLocationId.
// Callers MUST check for `undefined` and return immediately without writing
// their own response, since resolveScopedLocationId has already sent the 403.
export const resolveScopedLocationId = (req, res, requestedId) => {
  const scope = req.locationScope;
  if (!scope || scope.all) return requestedId ? Number(requestedId) : null;
  if (requestedId) {
    if (!scope.locationIds.includes(Number(requestedId))) {
      res.status(403).json({ success: false, message: 'You do not have access to the requested location' });
      return undefined;
    }
    return Number(requestedId);
  }
  return scope.requestedLocationId || scope.locationIds[0] || null;
};

// For list endpoints whose SQL filters on one or more location columns
// (location_id, or an OR of from/to location_id columns): validates every
// requested id the client passed against req.locationScope and returns the
// list of location ids the SQL query should additionally be restricted to.
// - Full access (scope.all): returns null (no restriction - the query runs
//   unrestricted, same as before).
// - Scoped roles: 403s (and returns undefined) if any requested id falls
//   outside their allowed locations; otherwise returns their full allowed
//   location id list, which the caller passes down to the service function
//   to AND onto the query (e.g. "AND location_id IN (?)"), so a scoped role
//   only ever sees rows for locations they're allowed to see - even if they
//   passed no location filter at all.
// Callers MUST check for `undefined` and return immediately without writing
// their own response, since resolveScopedLocationIds has already sent the 403.
export const resolveScopedLocationIds = (req, res, ...requestedIds) => {
  const scope = req.locationScope;
  if (!scope || scope.all) return null;
  for (const id of requestedIds) {
    if (id !== undefined && id !== null && id !== '' && !scope.locationIds.includes(Number(id))) {
      res.status(403).json({ success: false, message: 'You do not have access to the requested location' });
      return undefined;
    }
  }
  return scope.locationIds;
};

export const checkLocationAccess = (param = 'location_id') => async (req, res, next) => {
  try {
    const locationId = req.params[param] || req.body[param] || req.query[param];
    if (!locationId) return next();

    const roleName = req.user.role_name;
    if (isFullAccessRole(roleName)) return next();

    if (roleName === 'Warehouse Admin') {
      const rows = await query("SELECT id FROM locations WHERE id = ? AND location_type = 'Central Warehouse' AND is_active = 1", [locationId]);
      if (rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Central Warehouse access required' });
      }
      return next();
    }

    const assignedOutletIds = (req.user.outlet_ids || []).map((id) => Number(id)).filter(Boolean);
    const rows = await query("SELECT id FROM locations WHERE id = ? AND outlet_id IN (?) AND is_active = 1", [locationId, assignedOutletIds]);
    if (rows.length === 0) {
      return res.status(403).json({ success: false, message: 'You do not have access to this location' });
    }
    next();
  } catch (error) {
    console.error('Check location access error:', error);
    return res.status(500).json({ success: false, message: 'Error checking location access' });
  }
};
