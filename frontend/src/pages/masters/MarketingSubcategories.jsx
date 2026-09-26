import { useState, useEffect } from "react";
import { masterAPI } from "../../services/api";
import toast from "react-hot-toast";
import { Pencil, Plus } from "lucide-react";

// Req #26: data-driven management of Marketing expense subcategories.
// The Marketing expense head is resolved by normalized name (never by id);
// if Req #25's head row does not exist yet the screen shows an empty state
// instead of creating or assuming anything.
const isMarketingHead = (head) =>
  String(head?.expense_name || "").trim().toLowerCase() === "marketing";

const MarketingSubcategories = () => {
  const [marketingHead, setMarketingHead] = useState(null);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({ subcategory_name: "", is_active: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const headsRes = await masterAPI.getExpenseHeads();
        const head = (headsRes.data?.data || []).find(isMarketingHead) || null;
        setMarketingHead(head);
        if (head) {
          const subsRes = await masterAPI.getExpenseSubcategories({ expense_head_id: head.id });
          setSubcategories(subsRes.data?.data || []);
        }
      } catch (error) {
        console.error("Error loading marketing subcategories:", error);
        toast.error("Failed to load marketing subcategories");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const reload = async () => {
    if (!marketingHead) return;
    try {
      const subsRes = await masterAPI.getExpenseSubcategories({ expense_head_id: marketingHead.id });
      setSubcategories(subsRes.data?.data || []);
    } catch (error) {
      console.error("Error reloading marketing subcategories:", error);
      toast.error("Failed to load marketing subcategories");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormData({ subcategory_name: "", is_active: true });
    setShowModal(true);
  };

  const openEdit = (sub) => {
    setEditing(sub);
    setFormData({ subcategory_name: sub.subcategory_name, is_active: !!sub.is_active });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const name = formData.subcategory_name.trim();
    if (!name) {
      toast.error("Subcategory name is required");
      return;
    }
    if (name.length > 100) {
      toast.error("Subcategory name must be 100 characters or less");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await masterAPI.updateExpenseSubcategory(editing.id, {
          subcategory_name: name,
          is_active: formData.is_active ? 1 : 0,
        });
        toast.success("Subcategory updated");
      } else {
        await masterAPI.createExpenseSubcategory({
          expense_head_id: marketingHead.id,
          subcategory_name: name,
          is_active: formData.is_active ? 1 : 0,
        });
        toast.success("Subcategory created");
      }
      setShowModal(false);
      await reload();
    } catch (error) {
      console.error("Error saving subcategory:", error);
      toast.error(error.response?.data?.message || "Failed to save subcategory");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (sub) => {
    try {
      await masterAPI.updateExpenseSubcategory(sub.id, { is_active: sub.is_active ? 0 : 1 });
      toast.success(sub.is_active ? "Subcategory deactivated" : "Subcategory activated");
      await reload();
    } catch (error) {
      console.error("Error updating subcategory:", error);
      toast.error(error.response?.data?.message || "Failed to update subcategory");
    }
  };

  return (
    <div className="master-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Marketing Subcategories</h1>
          <p className="page-subtitle">Manage subcategories for the Marketing expense head</p>
        </div>
        <button className="btn-primary" onClick={openCreate} disabled={!marketingHead}>
          <Plus size={16} /> Add Subcategory
        </button>
      </div>

      {!loading && !marketingHead && (
        <div className="empty-state">
          <p>Marketing expense head is not configured yet.</p>
        </div>
      )}

      {marketingHead && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subcategory Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="3">Loading...</td></tr>
              ) : subcategories.length === 0 ? (
                <tr><td colSpan="3">No subcategories yet. Create one to classify Marketing expenses.</td></tr>
              ) : (
                subcategories.map((sub) => (
                  <tr key={sub.id}>
                    <td>{sub.subcategory_name}</td>
                    <td>
                      <span className={`status-badge ${sub.is_active ? "active" : "inactive"}`}>
                        {sub.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button className="btn-icon" onClick={() => openEdit(sub)} title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button className="btn-secondary btn-sm" onClick={() => toggleActive(sub)}>
                        {sub.is_active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? "Edit Subcategory" : "Add Subcategory"}</h2>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Subcategory Name *</label>
                <input
                  type="text"
                  value={formData.subcategory_name}
                  onChange={(e) => setFormData({ ...formData, subcategory_name: e.target.value })}
                  maxLength={100}
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />{" "}
                  Active
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Saving..." : editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarketingSubcategories;
