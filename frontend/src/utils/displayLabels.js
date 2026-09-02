// Cosmetic-only rename layer: the database and backend logic still use the
// original names (location_type='Central Kitchen', role_name='Central
// Kitchen Admin') since dozens of backend string comparisons depend on them.
// This translates those raw values to the new user-facing names wherever
// they're rendered, without touching the underlying data or logic.
const LABEL_MAP = {
  "Central Kitchen": "Bakehouse",
  "Central Kitchen Admin": "Bakehouse Admin",
  "Central Kitchens": "Bakehouses",
  "Central Kitchen Dashboard": "Bakehouse Dashboard",
};

export const displayLabel = (value) => {
  if (value === null || value === undefined) return value;
  return LABEL_MAP[value] ?? value;
};
