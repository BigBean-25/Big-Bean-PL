import { useEffect, useMemo, useState } from "react";
import { warehouseAPI, masterAPI } from "../../services/api";
import {
  PageHeader, SectionCard, TableWrapper, LoadingRows, EmptyState, StatusBadge,
  getPrimaryColor, getThemeMode, getCardClass, getInputClass,
} from "../../components/ui";
import {
  Plus, Search, RotateCcw, MapPin, Warehouse as WarehouseIcon, ChefHat, Store,
  Building2, Eye, Edit2, Power, RefreshCw, X, Save,
} from "lucide-react";
import { displayLabel } from "../../utils/displayLabels";
import toast from "react-hot-toast";

const LOCATION_TYPES = ["Outlet", "Central Warehouse", "Central Kitchen", "Corporate Office", "Dark Store"];
const NON_OUTLET_TYPES = ["Central Warehouse", "Central Kitchen", "Dark Store"];

const TypeIcon = (type) => {
  if (type === "Central Warehouse") return WarehouseIcon;
  if (type === "Central Kitchen") return ChefHat;
  if (type === "Outlet") return Store;
  return Building2;
};

const fmtDate = (d) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt)) return "-";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const emptyForm = () => ({
  location_code: "",
  location_name: "",
  location_type: "Outlet",
  outlet_id: "",
  is_inventory_location: 1,
  is_active: 1,
  gstin: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  phone: "",
  email: "",
});

export default function LocationManagement() {
  const isDark = getThemeMode() === "dark";
  const primaryColor = getPrimaryColor();
  const cardClass = getCardClass(isDark);
  const inputClass = getInputClass(isDark);

  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const [outlets, setOutlets] = useState([]);

  const [filters, setFilters] = useState({ search: "", location_type: "", is_active: "", is_inventory_location: "" });

  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [formData, setFormData] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const [viewLocation, setViewLocation] = useState(null);
  const [viewSummary, setViewSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [togglingId, setTogglingId] = useState(null);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const params = { scope: "management", ...filters };
      const res = await warehouseAPI.getLocations(params);
      setLocations(res?.data?.data || []);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load locations");
    } finally {
      setLoading(false);
    }
  };

  const fetchOutlets = async () => {
    try {
      const res = await masterAPI.getOutlets();
      const rows = res?.data?.data || res?.data || [];
      setOutlets(Array.isArray(rows) ? rows : []);
    } catch {
      // outlets are optional for non-outlet location types
    }
  };

  useEffect(() => { fetchOutlets(); }, []);
  useEffect(() => { fetchLocations(); }, [filters.location_type, filters.is_active, filters.is_inventory_location]);

  const filteredLocations = useMemo(() => {
    if (!filters.search) return locations;
    const term = filters.search.toLowerCase();
    return locations.filter((l) =>
      (l.location_code || "").toLowerCase().includes(term) || (l.location_name || "").toLowerCase().includes(term)
    );
  }, [locations, filters.search]);

  const kpis = useMemo(() => ({
    total: locations.length,
    active: locations.filter((l) => Number(l.is_active) === 1).length,
    inventory: locations.filter((l) => Number(l.is_inventory_location) === 1).length,
    warehouses: locations.filter((l) => l.location_type === "Central Warehouse").length,
    kitchens: locations.filter((l) => l.location_type === "Central Kitchen").length,
  }), [locations]);

  const resetFilters = () => setFilters({ search: "", location_type: "", is_active: "", is_inventory_location: "" });

  const openAdd = () => {
    setEditingLocation(null);
    setFormData(emptyForm());
    setShowForm(true);
  };

  const openEdit = (loc) => {
    setEditingLocation(loc);
    setFormData({
      location_code: loc.location_code || "",
      location_name: loc.location_name || "",
      location_type: loc.location_type || "Outlet",
      outlet_id: loc.outlet_id || "",
      is_inventory_location: Number(loc.is_inventory_location) === 1 ? 1 : 0,
      is_active: Number(loc.is_active) === 1 ? 1 : 0,
      gstin: loc.gstin || "",
      address: loc.address || "",
      city: loc.city || "",
      state: loc.state || "",
      pincode: loc.pincode || "",
      phone: loc.phone || "",
      email: loc.email || "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingLocation(null);
    setFormData(emptyForm());
  };

  const openView = async (loc) => {
    setViewLocation(loc);
    setViewSummary(null);
    if (Number(loc.is_inventory_location) === 1) {
      setSummaryLoading(true);
      try {
        const res = await warehouseAPI.getLocationSummary(loc.id);
        setViewSummary(res?.data?.data || null);
      } catch {
        setViewSummary(null);
      } finally {
        setSummaryLoading(false);
      }
    }
  };

  const handleTypeChange = (type) => {
    setFormData((prev) => {
      const next = { ...prev, location_type: type };
      if (NON_OUTLET_TYPES.includes(type)) {
        next.outlet_id = "";
        next.is_inventory_location = 1;
      } else if (type === "Corporate Office") {
        next.outlet_id = "";
        if (prev.location_type !== "Corporate Office") next.is_inventory_location = 0;
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.location_code.trim()) return toast.error("Location code is required");
    if (!formData.location_name.trim()) return toast.error("Location name is required");
    if (formData.location_type === "Outlet" && !formData.outlet_id) return toast.error("Mapped outlet is required for Outlet type");
    if (formData.gstin.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gstin.trim().toUpperCase())) {
      return toast.error("GSTIN format is invalid (expected format: 22AAAAA0000A1Z5)");
    }
    if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      return toast.error("Email format is invalid");
    }

    setSaving(true);
    try {
      const payload = {
        location_code: formData.location_code.trim(),
        location_name: formData.location_name.trim(),
        location_type: formData.location_type,
        outlet_id: formData.location_type === "Outlet" ? Number(formData.outlet_id) : null,
        is_inventory_location: Number(formData.is_inventory_location),
        is_active: Number(formData.is_active),
        gstin: formData.gstin.trim() || null,
        address: formData.address.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        pincode: formData.pincode.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
      };

      if (editingLocation) {
        await warehouseAPI.updateLocation(editingLocation.id, payload);
        toast.success("Location updated successfully");
      } else {
        await warehouseAPI.createLocation(payload);
        toast.success("Location created successfully");
      }
      closeForm();
      fetchLocations();
    } catch (error) {
      toast.error(error.response?.data?.message || "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (loc) => {
    const nextActive = Number(loc.is_active) === 1 ? 0 : 1;
    setTogglingId(loc.id);
    try {
      await warehouseAPI.updateLocation(loc.id, { is_active: nextActive });
      toast.success(nextActive ? "Location activated" : "Location deactivated");
      fetchLocations();
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const mappedOutletDisplay = (loc) => {
    if (NON_OUTLET_TYPES.includes(loc.location_type) || loc.location_type === "Corporate Office") return "Not Applicable";
    return loc.outlet_name || "—";
  };

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={fetchLocations} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
        <RefreshCw size={16} /> Refresh
      </button>
      <button onClick={openAdd} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-semibold text-white shadow-[0_3px_12px_rgba(115,103,240,0.35)]" style={{ backgroundColor: primaryColor }}>
        <Plus size={16} /> Add Location
      </button>
    </div>
  );

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <PageHeader
        title="Location Management"
        subtitle="Manage outlets, warehouses, kitchens and other operational locations."
        actions={headerActions}
        isDark={isDark}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total Locations", value: kpis.total, icon: Building2 },
          { label: "Active Locations", value: kpis.active, icon: Power },
          { label: "Inventory Locations", value: kpis.inventory, icon: MapPin },
          { label: "Central Warehouses", value: kpis.warehouses, icon: WarehouseIcon },
          { label: "Bakehouses", value: kpis.kitchens, icon: ChefHat },
        ].map((k) => (
          <div key={k.label} className={`rounded-xl border p-4 shadow-[0_2px_12px_rgba(47,43,61,0.06)] ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-[11px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{k.label}</p>
                <p className={`mt-1 text-xl font-bold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{k.value}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${primaryColor}18`, color: primaryColor }}>
                <k.icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <SectionCard title="Filters" isDark={isDark}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className={`h-10 w-full rounded-lg border pl-9 pr-3 text-[14px] outline-none ${inputClass}`}
              placeholder="Search location code or name"
            />
          </div>
          <select value={filters.location_type} onChange={(e) => setFilters({ ...filters, location_type: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Types</option>
            {LOCATION_TYPES.map((t) => <option key={t} value={t}>{displayLabel(t)}</option>)}
          </select>
          <select value={filters.is_active} onChange={(e) => setFilters({ ...filters, is_active: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Status</option>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
          <select value={filters.is_inventory_location} onChange={(e) => setFilters({ ...filters, is_inventory_location: e.target.value })} className={`h-10 rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}>
            <option value="">All Inventory</option>
            <option value="1">Inventory Location</option>
            <option value="0">Non-Inventory Location</option>
          </select>
          <button onClick={resetFilters} className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349] text-[#A5A8B6]" : "border-[#EBE9F1] bg-white text-[#6F6B7D]"}`}>
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </SectionCard>

      <SectionCard isDark={isDark}>
        {!loading && filteredLocations.length === 0 ? (
          <EmptyState icon={MapPin} title="No locations match the selected filters." isDark={isDark} action={
            <button onClick={openAdd} className="flex items-center gap-2 rounded-lg px-4 py-2 text-[14px] font-semibold text-white" style={{ backgroundColor: primaryColor }}>
              <Plus size={15} /> Add Location
            </button>
          } />
        ) : (
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead className={`sticky top-0 z-10 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                  <th className="px-3 py-3">Location Code</th>
                  <th className="px-3 py-3">Location Name</th>
                  <th className="px-3 py-3">Location Type</th>
                  <th className="px-3 py-3">Mapped Outlet</th>
                  <th className="px-3 py-3 text-center">Inventory</th>
                  <th className="px-3 py-3 text-center">Status</th>
                  <th className="px-3 py-3">Created Date</th>
                  <th className="sticky right-0 px-3 py-3 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <LoadingRows rows={5} cols={8} isDark={isDark} /> : filteredLocations.map((loc) => {
                  const Icon = TypeIcon(loc.location_type);
                  return (
                    <tr key={loc.id} className={`border-b transition ${isDark ? "border-[#3B405A] hover:bg-[#3B405A]/30" : "border-[#F3F2F7] hover:bg-[#F8F7FA]"}`}>
                      <td className="px-3 py-2.5 font-medium">{loc.location_code}</td>
                      <td className="px-3 py-2.5">{loc.location_name}</td>
                      <td className="px-3 py-2.5"><span className="flex items-center gap-1.5"><Icon size={14} /> {displayLabel(loc.location_type)}</span></td>
                      <td className="px-3 py-2.5">{mappedOutletDisplay(loc)}</td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={Number(loc.is_inventory_location) === 1 ? "Active" : "Inactive"} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge status={Number(loc.is_active) === 1 ? "Active" : "Inactive"} />
                      </td>
                      <td className="px-3 py-2.5">{fmtDate(loc.created_at)}</td>
                      <td className="sticky right-0 px-3 py-2.5 text-center" style={{ background: isDark ? "#2F3349" : "white" }}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => openView(loc)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="View">
                            <Eye size={15} />
                          </button>
                          <button onClick={() => openEdit(loc)} className={`rounded-md p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Edit">
                            <Edit2 size={15} />
                          </button>
                          <button
                            onClick={() => toggleActive(loc)}
                            disabled={togglingId === loc.id}
                            className={`rounded-md p-1.5 ${Number(loc.is_active) === 1 ? "text-rose-500" : "text-emerald-500"} ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`}
                            title={Number(loc.is_active) === 1 ? "Deactivate" : "Activate"}
                          >
                            <Power size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{editingLocation ? "Edit Location" : "Add Location"}</h3>
              <button onClick={closeForm} className="text-2xl leading-none"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Location Code *</label>
                  <input
                    value={formData.location_code}
                    onChange={(e) => setFormData({ ...formData, location_code: e.target.value })}
                    className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                    placeholder="e.g. BBC-WH-002"
                    required
                  />
                </div>
                <div>
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Location Name *</label>
                  <input
                    value={formData.location_name}
                    onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                    className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                    required
                  />
                </div>
                <div>
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Location Type *</label>
                  <select
                    value={formData.location_type}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                  >
                    {LOCATION_TYPES.map((t) => <option key={t} value={t}>{displayLabel(t)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Mapped Outlet</label>
                  {formData.location_type === "Outlet" ? (
                    <select
                      value={formData.outlet_id}
                      onChange={(e) => setFormData({ ...formData, outlet_id: e.target.value })}
                      className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                      required
                    >
                      <option value="">Select Outlet</option>
                      {outlets.map((o) => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
                    </select>
                  ) : (
                    <input value="Not Applicable" disabled className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none opacity-60 ${inputClass}`} />
                  )}
                </div>
                <div>
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Inventory Location</label>
                  <select
                    value={formData.is_inventory_location}
                    onChange={(e) => setFormData({ ...formData, is_inventory_location: Number(e.target.value) })}
                    disabled={NON_OUTLET_TYPES.includes(formData.location_type)}
                    className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass} ${NON_OUTLET_TYPES.includes(formData.location_type) ? "opacity-60" : ""}`}
                  >
                    <option value={1}>Yes</option>
                    <option value={0}>No</option>
                  </select>
                </div>
                <div>
                  <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Active</label>
                  <select
                    value={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: Number(e.target.value) })}
                    className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                  >
                    <option value={1}>Active</option>
                    <option value={0}>Inactive</option>
                  </select>
                </div>
              </div>

              <div>
                <p className={`mb-2 text-[12px] font-semibold uppercase tracking-wider ${isDark ? "text-[#A5A8B6]" : "text-[#A8AAAE]"}`}>
                  Invoice Details (used as the Buyer block when printing Warehouse Purchase Orders)
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>GSTIN</label>
                    <input
                      value={formData.gstin}
                      onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                      maxLength={15}
                      className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                      placeholder="e.g. 29AAMCB1875B1ZM"
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Phone</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className={`min-h-[70px] w-full rounded-lg border px-3 py-2 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>City</label>
                    <input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>State</label>
                    <input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Pincode</label>
                    <input
                      value={formData.pincode}
                      onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                      className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={`mb-1.5 block text-[13px] font-medium ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className={`h-10 w-full rounded-lg border px-3 text-[14px] outline-none ${inputClass}`}
                    />
                  </div>
                </div>
              </div>

              {editingLocation && (
                <p className={`rounded-lg border px-3 py-2 text-[12px] ${isDark ? "border-[#3B405A] bg-[#25293C] text-[#A5A8B6]" : "border-[#EBE9F1] bg-[#F8F7FA] text-[#6F6B7D]"}`}>
                  Location code, type and outlet mapping can only be changed if this location has no inventory transactions yet.
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className={`h-10 rounded-lg border px-4 text-[14px] font-medium ${cardClass}`}>Cancel</button>
                <button type="submit" disabled={saving} className="flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-70" style={{ backgroundColor: primaryColor }}>
                  <Save size={15} /> {saving ? "Saving..." : editingLocation ? "Update Location" : "Create Location"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">{viewLocation.location_name}</h3>
              <button onClick={() => setViewLocation(null)} className="text-2xl leading-none"><X size={20} /></button>
            </div>
            <div className="space-y-3 p-4 text-[14px]">
              <DetailRow label="Location Code" value={viewLocation.location_code} isDark={isDark} />
              <DetailRow label="Location Type" value={displayLabel(viewLocation.location_type)} isDark={isDark} />
              <DetailRow label="Mapped Outlet" value={mappedOutletDisplay(viewLocation)} isDark={isDark} />
              <DetailRow label="Inventory Location" value={Number(viewLocation.is_inventory_location) === 1 ? "Yes" : "No"} isDark={isDark} />
              <DetailRow label="Status" value={Number(viewLocation.is_active) === 1 ? "Active" : "Inactive"} isDark={isDark} />
              <DetailRow label="Created Date" value={fmtDate(viewLocation.created_at)} isDark={isDark} />
              <DetailRow label="Updated Date" value={fmtDate(viewLocation.updated_at)} isDark={isDark} />

              {Number(viewLocation.is_inventory_location) === 1 && (
                <div className={`mt-3 rounded-lg border p-3 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
                  <p className={`mb-2 text-[12px] font-semibold uppercase tracking-wide ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>Operational Summary</p>
                  {summaryLoading ? (
                    <p className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>Loading...</p>
                  ) : viewSummary ? (
                    <div className="grid grid-cols-2 gap-2 text-[13px]">
                      <DetailRow label="Current Stock Value" value={`₹${Number(viewSummary.current_stock_value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`} isDark={isDark} />
                      <DetailRow label="Material Count" value={viewSummary.material_count ?? "—"} isDark={isDark} />
                      <DetailRow label="Pending Goods Receipts" value={viewSummary.pending_grns ?? "—"} isDark={isDark} />
                      <DetailRow label="Pending Outlet Purchase Orders" value={viewSummary.pending_requisitions ?? "—"} isDark={isDark} />
                      <DetailRow label="In-Transit Transfers" value={viewSummary.in_transit_transfers ?? "—"} isDark={isDark} />
                    </div>
                  ) : (
                    <p className={isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}>—</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, isDark }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className={`text-[13px] font-medium ${isDark ? "text-[#A5A8B6]" : "text-[#6F6B7D]"}`}>{label}</span>
      <span className={`text-right text-[13px] font-semibold ${isDark ? "text-[#D0D2D6]" : "text-[#2F2B3D]"}`}>{value ?? "—"}</span>
    </div>
  );
}
