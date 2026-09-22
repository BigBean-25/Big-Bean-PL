// Phase 7C2A2 - outlet-facing wastage labels mapped onto the existing
// warehouse_wastage_items columns: wastage_type ENUM('Damage','Expiry',
// 'Spoilage','Other') + reason VARCHAR(100). Counter/Preparation Wastage are
// deliberately stored as wastage_type='Other' with a fixed reason label -
// a discrete ENUM extension is optional Phase 7C2B work, not needed here.
export const WASTAGE_KINDS = [
  { kind: 'Damage', label: 'Damaged', wastage_type: 'Damage' },
  { kind: 'Expiry', label: 'Expired', wastage_type: 'Expiry' },
  { kind: 'Spoilage', label: 'Spoiled', wastage_type: 'Spoilage' },
  { kind: 'Counter Wastage', label: 'Counter Wastage', wastage_type: 'Other', reason: 'Counter Wastage' },
  { kind: 'Preparation Wastage', label: 'Preparation Wastage', wastage_type: 'Other', reason: 'Preparation Wastage' },
  { kind: 'Other', label: 'Other', wastage_type: 'Other' },
];

// Selected kind -> persisted (wastage_type, reason). Fixed-reason kinds always
// store their label; 'Other' keeps the user's free-text reason.
export const wastageKindToPayload = (kind, reasonText) => {
  const k = WASTAGE_KINDS.find((x) => x.kind === kind) || WASTAGE_KINDS.find((x) => x.kind === 'Damage');
  return { wastage_type: k.wastage_type, reason: k.reason || reasonText || null };
};

// Persisted (wastage_type, reason) -> kind for the edit form.
export const wastageItemToKind = (wastageType, reason) => {
  const fixed = WASTAGE_KINDS.find((x) => x.reason && x.wastage_type === wastageType && x.reason === reason);
  if (fixed) return fixed.kind;
  return (WASTAGE_KINDS.find((x) => x.kind === wastageType) || WASTAGE_KINDS.find((x) => x.kind === 'Other')).kind;
};
