// Shared maker-checker helpers. Every approval workflow in this codebase
// separates the user who created (or submitted) a record from the user who
// verifies / approves / rejects / posts it. Before this helper existed the
// same check was duplicated ~25 times across controllers, route handlers and
// services, with three different comparison styles (strict ===, Number()
// coercion) and two different error conventions (res.status(403), thrown
// Error that surfaced as 400 through generic route catches). Centralising it
// gives one NULL policy and one consistent 403 for self-approval violations.
//
// NULL/legacy policy: a missing creator identity stays fail-open (the guard
// simply does not fire). Local data shows every creator field is populated
// on insert, so NULL can only appear on rows written before the field
// existed. Switching those to fail-closed would lock such legacy rows out of
// review entirely, so that decision is deferred to the Phase 5D backfill.

export const isOwnDocument = (record, userId, creatorField = 'created_by') => {
  if (!record) return false;
  const creatorId = record[creatorField];
  if (creatorId === null || creatorId === undefined) return false;
  return Number(creatorId) === Number(userId);
};

export const assertNotOwnDocument = (record, userId, creatorField, action, docLabel = 'document') => {
  if (!isOwnDocument(record, userId, creatorField)) return;
  const err = new Error(`Creator cannot ${action} their own ${docLabel}`);
  err.statusCode = 403;
  throw err;
};
