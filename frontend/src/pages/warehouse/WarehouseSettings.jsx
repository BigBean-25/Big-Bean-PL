import { useEffect, useState } from "react";
import { warehouseAPI, getStoredPermissions } from "../../services/api";
import { SectionCard, PageHeader } from "../../components/ui";
import { getInputClass } from "../../components/ui";
import { Save, RotateCcw, ShieldAlert, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

const sections = [
  { title: "General Warehouse", keys: ["location_code","location_name","location_type","inventory_enabled","active_status"] },
  { title: "Inventory Controls", keys: ["allow_negative_stock","require_reason_for_manual_adjustment","require_approval_for_adjustment","require_approval_for_wastage","use_batch_tracking","use_expiry_tracking","costing_method"] },
  { title: "GRN Controls", keys: ["require_po_for_grn","allow_manual_grn","allow_over_receipt","over_receipt_tolerance_pct","require_rejected_qty_reason","require_batch_for_batch_tracked","require_expiry_for_expiry_tracked"] },
  { title: "Requisition / Dispatch Controls", keys: ["allow_partial_approval","allow_partial_dispatch","require_warehouse_approval","require_outlet_receipt_confirmation"] },
  { title: "Dispatch / Transit Controls", keys: ["require_vehicle_details","require_driver_details","require_dispatch_reference","require_transit_reconciliation","allow_receipt_with_damage","allow_receipt_with_short"] },
  { title: "Batch & Expiry Controls", keys: ["default_near_expiry_days","expiry_bucket_1_days","expiry_bucket_2_days","expiry_bucket_3_days","expiry_bucket_4_days","fefo_enabled"] },
  { title: "Physical Stock Controls", keys: ["require_physical_count_verification","require_physical_count_approval","auto_post_adjustment_after_approval","allow_locked_count_editing","default_count_frequency"] },
  { title: "Wastage Categories", keys: ["wastage_categories"] },
  { title: "Adjustment Reasons", keys: ["positive_adjustment_reasons","negative_adjustment_reasons"] },
  { title: "Reorder Defaults", keys: ["default_lead_time_days","default_safety_stock_qty"] },
  { title: "Purchase Order Controls", keys: ["require_po_approval","allow_creator_approve_own_po","allow_po_without_expected_delivery","default_payment_terms"] },
  { title: "Purchase Return Controls", keys: ["require_original_grn_for_return","require_purchase_return_approval","require_supplier_credit_tracking"] },
  { title: "Document Numbering", keys: ["po_prefix","grn_prefix","req_prefix","trf_prefix","phy_prefix","adj_prefix","wst_prefix","pr_prefix"] },
  { title: "Month-End / Period", keys: ["require_month_end_checklist","allow_transactions_in_locked_period"] },
  { title: "Report Defaults", keys: ["default_report_date_range","default_export_format","default_ageing_buckets","default_near_expiry_window"] },
];

const dangerous = ["allow_negative_stock","allow_over_receipt","over_receipt_tolerance_pct","allow_locked_count_editing","allow_transactions_in_locked_period","allow_creator_approve_own_po"];
const readOnly = ["costing_method","location_code","location_name","location_type"];

export default function WarehouseSettings({ locationId, locations, isDark }) {
  const permissions = getStoredPermissions()?.warehouse_settings || {};
  const canEdit = permissions?.can_edit;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState({});
  const [defs, setDefs] = useState({});
  const [dirty, setDirty] = useState(false);
  const inputClass = getInputClass(isDark);

  const currentLocation = locations.find((l) => String(l.id) === String(locationId));

  const fetchSettings = async () => {
    if (!locationId) return;
    setLoading(true);
    try {
      const res = await warehouseAPI.getWarehouseSettings(locationId);
      setValues(res?.data?.data?.values || {});
      setDefs(res?.data?.data?.definitions || {});
    } catch (error) {
      toast.error("Failed to load warehouse settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, [locationId]);

  const setValue = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const reset = () => { fetchSettings(); setDirty(false); };

  const save = async () => {
    if (!canEdit) return toast.error("Permission denied");
    setSaving(true);
    try {
      const payload = {};
      for (const key of Object.keys(defs)) {
        if (values[key] !== undefined) payload[key] = values[key];
      }
      await warehouseAPI.updateWarehouseSettings({ location_id: locationId, settings: payload });
      toast.success("Warehouse settings saved");
      setDirty(false);
      fetchSettings();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const renderLabel = (key) => {
    const map = {
      location_code: "Warehouse Code", location_name: "Warehouse Name", location_type: "Location Type",
      inventory_enabled: "Inventory Enabled", active_status: "Active Status",
      allow_negative_stock: "Allow Negative Stock", require_reason_for_manual_adjustment: "Require Reason for Manual Adjustment",
      require_approval_for_adjustment: "Require Approval for Adjustment", require_approval_for_wastage: "Require Approval for Wastage",
      use_batch_tracking: "Use Batch Tracking Where Material Requires It", use_expiry_tracking: "Use Expiry Tracking Where Material Requires It",
      costing_method: "Costing Method", require_po_for_grn: "Require PO for GRN", allow_manual_grn: "Allow Manual GRN",
      allow_over_receipt: "Allow Over-Receipt", over_receipt_tolerance_pct: "Over-Receipt Tolerance %",
      require_rejected_qty_reason: "Require Rejected Qty Reason", require_batch_for_batch_tracked: "Require Batch for Batch-Tracked Material",
      require_expiry_for_expiry_tracked: "Require Expiry for Expiry-Tracked Material", allow_partial_approval: "Allow Partial Approval",
      allow_partial_dispatch: "Allow Partial Dispatch", require_warehouse_approval: "Require Warehouse Approval",
      require_outlet_receipt_confirmation: "Require Outlet Receipt Confirmation", require_vehicle_details: "Require Vehicle Details",
      require_driver_details: "Require Driver Details", require_dispatch_reference: "Require Dispatch Reference",
      require_transit_reconciliation: "Require Transit Reconciliation", allow_receipt_with_damage: "Allow Receipt With Damage",
      allow_receipt_with_short: "Allow Receipt With Short", default_near_expiry_days: "Default Near Expiry Days",
      expiry_bucket_1_days: "Expiry Bucket 0-7 Days", expiry_bucket_2_days: "Expiry Bucket 8-15 Days",
      expiry_bucket_3_days: "Expiry Bucket 16-30 Days", expiry_bucket_4_days: "Expiry Bucket 31-60 Days",
      fefo_enabled: "FEFO Enabled", require_physical_count_verification: "Require Verification",
      require_physical_count_approval: "Require Approval", auto_post_adjustment_after_approval: "Auto Post Adjustment After Approval",
      allow_locked_count_editing: "Allow Locked Count Editing", default_count_frequency: "Default Count Frequency",
      wastage_categories: "Wastage Categories", positive_adjustment_reasons: "Positive Adjustment Reasons",
      negative_adjustment_reasons: "Negative Adjustment Reasons", default_lead_time_days: "Default Lead Time Days",
      default_safety_stock_qty: "Default Safety Stock Qty", require_po_approval: "Require PO Approval",
      allow_creator_approve_own_po: "Allow Creator to Approve Own PO", allow_po_without_expected_delivery: "Allow PO Without Expected Delivery Date",
      default_payment_terms: "Default Payment Terms", require_original_grn_for_return: "Require Original GRN",
      require_purchase_return_approval: "Require Approval", require_supplier_credit_tracking: "Require Supplier Credit Tracking",
      po_prefix: "PO Prefix", grn_prefix: "GRN Prefix", req_prefix: "Requisition Prefix",
      trf_prefix: "Transfer Prefix", phy_prefix: "Physical Count Prefix", adj_prefix: "Adjustment Prefix",
      wst_prefix: "Wastage Prefix", pr_prefix: "Purchase Return Prefix", require_month_end_checklist: "Require Month-End Checklist",
      allow_transactions_in_locked_period: "Allow Transactions in Locked Period", default_report_date_range: "Default Report Date Range",
      default_export_format: "Default Export Format", default_ageing_buckets: "Default Ageing Buckets",
      default_near_expiry_window: "Default Near Expiry Window (days)",
    };
    return map[key] || key;
  };

  const renderInput = (key) => {
    const type = defs[key]?.type;
    const v = values[key];
    const disabled = readOnly.includes(key) || !canEdit;
    const warn = dangerous.includes(key);
    if (type === "boolean") {
      return (
        <button
          onClick={() => !disabled && setValue(key, !v)}
          className={`relative h-6 w-11 rounded-full transition ${v ? "bg-[#28C76F]" : isDark ? "bg-[#3B405A]" : "bg-[#EBE9F1]"} ${disabled ? "opacity-60" : ""}`}
        >
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${v ? "left-6" : "left-1"}`} />
        </button>
      );
    }
    if (type === "json") {
      const text = Array.isArray(v) ? v.join("\n") : typeof v === "object" ? JSON.stringify(v, null, 2) : String(v ?? "");
      return (
        <textarea
          value={text}
          onChange={(e) => {
            const lines = e.target.value.split("\n").map((x) => x.trim()).filter(Boolean);
            setValue(key, lines);
          }}
          disabled={disabled}
          className={`min-h-[72px] w-full rounded-md border px-3 py-2 text-[13px] outline-none ${inputClass} ${disabled ? "opacity-60" : ""}`}
        />
      );
    }
    return (
      <input
        type={type === "integer" || type === "decimal" ? "number" : "text"}
        value={v ?? ""}
        onChange={(e) => setValue(key, e.target.value)}
        disabled={disabled}
        className={`w-full rounded-md border px-3 py-2 text-[13px] outline-none ${inputClass} ${disabled ? "opacity-60" : ""}`}
      />
    );
  };

  if (loading) {
    return (
      <SectionCard isDark={isDark}>
        <div className="flex min-h-[180px] items-center justify-center">
          <div className={`flex items-center gap-2 text-[13px] ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>
            <Loader2 size={20} className="animate-spin" />
            Loading warehouse settings...
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouse Settings"
        subtitle="Configure warehouse operational controls, inventory rules and workflow defaults"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={reset} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
              <RotateCcw size={16} /> Reset
            </button>
            {canEdit && (
              <button onClick={save} disabled={!dirty || saving} className={`inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold text-white ${dirty && !saving ? "bg-[#7367F0] hover:bg-[#6354D8]" : "bg-[#A8AAAE]"}`}>
                <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        }
        isDark={isDark}
      />

      {dirty && (
        <div className={`rounded-lg px-3 py-2 text-[13px] ${isDark ? "bg-[#3B405A] text-[#D0D2D6]" : "bg-[#FFF3E6] text-[#FF9F43]"}`}>
          Unsaved changes
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {sections.map((section) => (
          <div key={section.title} className={`rounded-xl border p-4 shadow-sm ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <h3 className="mb-3 text-[14px] font-semibold">{section.title}</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.keys.map((key) => (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center gap-1 text-[13px] font-medium text-[#6F6B7D]" style={{ color: isDark ? "#A5A8B6" : "#6F6B7D" }}>
                    {renderLabel(key)}
                    {dangerous.includes(key) && <ShieldAlert size={14} className="text-[#EA5455]" />}
                  </div>
                  {renderInput(key)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
