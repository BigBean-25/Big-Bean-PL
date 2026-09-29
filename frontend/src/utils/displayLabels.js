// Cosmetic-only rename layer: the database and backend logic still use the
// original names (location_type='Central Kitchen', role_name='Central
// Kitchen Admin') since dozens of backend string comparisons depend on them.
// This translates those raw values to the new user-facing names wherever
// they're rendered, without touching the underlying data or logic.
const LABEL_MAP = {
  "Central Kitchen": "Bakehouse",
  "Central Kitchen Admin": "Bakehouse Manager",
  "Bakehouse Admin": "Bakehouse Manager",
  "Central Kitchens": "Bakehouses",
  "Central Kitchen Dashboard": "Bakehouse Dashboard",
  // Approved role presentation labels. Canonical role_name values in the
  // database are unchanged - dozens of backend string comparisons (roleAccess.js
  // ALL_OUTLET_ROLES/LOCKED_OUTLET_ROLES, buildDefaultPermissionMatrix,
  // canTransitionProductionRequest) depend on them, so this stays cosmetic.
  Admin: "Head Office Admin",
  "Outlet Admin": "Outlet Manager",
  "Warehouse Admin": "Warehouse Manager",
  "Technical Admin": "Technical Support",
};

export const displayLabel = (value) => {
  if (value === null || value === undefined) return value;
  return LABEL_MAP[value] ?? value;
};
