import { query, getConnection } from '../config/database.js';

export const VALUE_TYPES = ['boolean', 'integer', 'decimal', 'string', 'json'];

const DEFAULTS = {
  // General warehouse
  location_code: { value: '', type: 'string' },
  location_name: { value: '', type: 'string' },
  location_type: { value: '', type: 'string' },
  inventory_enabled: { value: true, type: 'boolean' },
  active_status: { value: true, type: 'boolean' },

  // Inventory controls
  allow_negative_stock: { value: false, type: 'boolean' },
  require_reason_for_manual_adjustment: { value: true, type: 'boolean' },
  require_approval_for_adjustment: { value: true, type: 'boolean' },
  require_approval_for_wastage: { value: true, type: 'boolean' },
  use_batch_tracking: { value: true, type: 'boolean' },
  use_expiry_tracking: { value: true, type: 'boolean' },
  costing_method: { value: 'WAC', type: 'string' },

  // GRN controls
  require_po_for_grn: { value: false, type: 'boolean' },
  allow_manual_grn: { value: true, type: 'boolean' },
  allow_over_receipt: { value: false, type: 'boolean' },
  over_receipt_tolerance_pct: { value: 0, type: 'decimal' },
  require_rejected_qty_reason: { value: true, type: 'boolean' },
  require_batch_for_batch_tracked: { value: true, type: 'boolean' },
  require_expiry_for_expiry_tracked: { value: true, type: 'boolean' },

  // Requisition controls
  allow_partial_approval: { value: true, type: 'boolean' },
  allow_partial_dispatch: { value: true, type: 'boolean' },
  require_warehouse_approval: { value: true, type: 'boolean' },
  require_outlet_receipt_confirmation: { value: true, type: 'boolean' },

  // Dispatch / transit
  require_vehicle_details: { value: false, type: 'boolean' },
  require_driver_details: { value: false, type: 'boolean' },
  require_dispatch_reference: { value: false, type: 'boolean' },
  require_transit_reconciliation: { value: true, type: 'boolean' },
  allow_receipt_with_damage: { value: true, type: 'boolean' },
  allow_receipt_with_short: { value: true, type: 'boolean' },

  // Batch & expiry
  default_near_expiry_days: { value: 30, type: 'integer' },
  expiry_bucket_1_days: { value: 7, type: 'integer' },
  expiry_bucket_2_days: { value: 15, type: 'integer' },
  expiry_bucket_3_days: { value: 30, type: 'integer' },
  expiry_bucket_4_days: { value: 60, type: 'integer' },
  fefo_enabled: { value: true, type: 'boolean' },

  // Physical stock
  require_physical_count_verification: { value: true, type: 'boolean' },
  require_physical_count_approval: { value: true, type: 'boolean' },
  auto_post_adjustment_after_approval: { value: true, type: 'boolean' },
  allow_locked_count_editing: { value: false, type: 'boolean' },
  default_count_frequency: { value: 'Weekly', type: 'string' },

  // Wastage / adjustment reasons (stored as JSON arrays)
  wastage_categories: { value: ['Damage','Spoilage','Expiry','Handling Loss','Leakage','Breakage','Quality Rejection','Pest Damage','Storage Damage','Sampling','Other'], type: 'json' },
  positive_adjustment_reasons: { value: ['Counting Correction','Unrecorded Receipt','Unit Conversion Correction','Found Stock','Approved System Correction'], type: 'json' },
  negative_adjustment_reasons: { value: ['Physical Shortage','Breakage','Damage','Expiry','Theft','System Correction','Unexplained Variance'], type: 'json' },

  // Reorder defaults
  default_lead_time_days: { value: 3, type: 'integer' },
  default_safety_stock_qty: { value: 0, type: 'decimal' },

  // PO controls
  require_po_approval: { value: true, type: 'boolean' },
  allow_creator_approve_own_po: { value: false, type: 'boolean' },
  allow_po_without_expected_delivery: { value: true, type: 'boolean' },
  default_payment_terms: { value: 'Net 7 Days', type: 'string' },

  // Purchase return controls
  require_original_grn_for_return: { value: true, type: 'boolean' },
  require_purchase_return_approval: { value: true, type: 'boolean' },
  require_supplier_credit_tracking: { value: true, type: 'boolean' },

  // Document numbering
  po_prefix: { value: 'PO', type: 'string' },
  grn_prefix: { value: 'GRN', type: 'string' },
  req_prefix: { value: 'REQ', type: 'string' },
  trf_prefix: { value: 'TRF', type: 'string' },
  phy_prefix: { value: 'PSC', type: 'string' },
  adj_prefix: { value: 'ADJ', type: 'string' },
  wst_prefix: { value: 'WST', type: 'string' },
  pr_prefix: { value: 'PR', type: 'string' },

  // Month-end
  require_month_end_checklist: { value: true, type: 'boolean' },
  allow_transactions_in_locked_period: { value: false, type: 'boolean' },

  // Report defaults
  default_report_date_range: { value: 'Current Month', type: 'string' },
  default_export_format: { value: 'Excel', type: 'string' },
  default_ageing_buckets: { value: ['0-30','31-60','61-90','91-180','180+'], type: 'json' },
  default_near_expiry_window: { value: 30, type: 'integer' },
};

function castValue(raw, type) {
  if (type === 'boolean') return raw === true || raw === 'true' || raw === '1' || raw === 1;
  if (type === 'integer') return Number.isFinite(Number(raw)) ? Math.trunc(Number(raw)) : 0;
  if (type === 'decimal') return Number.isFinite(Number(raw)) ? Number(raw) : 0;
  if (type === 'json') {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return raw;
  }
  return raw ?? '';
}

function normalizeValue(raw, type) {
  const typed = castValue(raw, type);
  if (type === 'json') return JSON.stringify(typed);
  if (type === 'boolean') return typed ? '1' : '0';
  return String(typed ?? '');
}

export function getSettingDefinitions() {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { ...v, editable: k !== 'costing_method' }])); // keep costing WAC read-only
}

export async function getWarehouseSettings(locationId) {
  const loc = await query('SELECT id, location_code, location_name, location_type, is_active FROM locations WHERE id = ?', [locationId]);
  const rows = await query('SELECT setting_key, setting_value, value_type FROM warehouse_settings WHERE location_id = ?', [locationId]);
  const saved = Object.fromEntries(rows.map(r => [r.setting_key, { value: castValue(r.setting_value, r.value_type), type: r.value_type }]));

  const effective = {};
  for (const [key, def] of Object.entries(DEFAULTS)) {
    if (saved[key] !== undefined) {
      effective[key] = saved[key].value;
    } else {
      effective[key] = def.value;
    }
  }

  // Augment with location master info
  effective.location_code = loc[0]?.location_code || '';
  effective.location_name = loc[0]?.location_name || '';
  effective.location_type = loc[0]?.location_type || '';
  effective.active_status = !!loc[0]?.is_active;

  return {
    location_id: Number(locationId),
    definitions: getSettingDefinitions(),
    values: effective,
  };
}

export async function updateWarehouseSettings(locationId, settings, userId) {
  if (!Number(locationId)) throw new Error('location_id is required');
  if (!settings || typeof settings !== 'object') throw new Error('settings object is required');

  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    for (const [key, raw] of Object.entries(settings)) {
      if (!DEFAULTS[key]) continue; // ignore unknown keys
      const def = DEFAULTS[key];
      const stored = normalizeValue(raw, def.type);
      await conn.execute(
        `INSERT INTO warehouse_settings (location_id, setting_key, setting_value, value_type, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           setting_value = VALUES(setting_value),
           value_type = VALUES(value_type),
           updated_by = VALUES(updated_by)`,
        [Number(locationId), key, stored, def.type, userId || null]
      );
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return getWarehouseSettings(locationId);
}

export async function getSettingValue(locationId, key) {
  const def = DEFAULTS[key];
  if (!def) return undefined;
  const rows = await query('SELECT setting_value, value_type FROM warehouse_settings WHERE location_id = ? AND setting_key = ?', [locationId, key]);
  if (rows.length === 0) return def.value;
  return castValue(rows[0].setting_value, rows[0].value_type);
}
