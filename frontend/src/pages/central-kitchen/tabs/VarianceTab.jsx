import { useState } from "react";
import { productionAPI } from "../../../services/api";
import { SectionCard, TableWrapper, EmptyState } from "../../../components/ui";
import { X, Download, Eye } from "lucide-react";
import toast from "react-hot-toast";

export default function VarianceTab({ variance, kitchenId, isDark }) {
  const [viewing, setViewing] = useState(null);

  const openDetail = async (v) => {
    try {
      const res = await productionAPI.getProductionVarianceByBatch(v.id);
      setViewing(res?.data?.data);
    } catch { toast.error("Failed to load variance detail"); }
  };

  const handleExport = async () => {
    try {
      const res = await productionAPI.exportProductionVariance({ central_kitchen_id: kitchenId });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `production_variance_${new Date().toISOString().split("T")[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={handleExport} className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[14px] font-medium ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`}><Download size={16} /> Export</button>
      </div>
      <SectionCard isDark={isDark}>
        {variance.length === 0 ? <EmptyState isDark={isDark} title="No Production Variance Data" subtitle="Variance analysis will appear after production batches are posted." /> : (
          <TableWrapper isDark={isDark}>
            <table className="w-full border-collapse text-[13px]">
              <thead className={`sticky top-0 ${isDark ? "bg-[#2F3349]" : "bg-white"}`}>
                <tr className={`border-b text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? "border-[#3B405A] text-[#A5A8B6]" : "border-[#EBE9F1] text-[#6F6B7D]"}`}>
                  <th className="px-3 py-3">Batch No</th><th className="px-3 py-3">Product</th><th className="px-3 py-3">Planned / Accepted</th><th className="px-3 py-3">Yield %</th><th className="px-3 py-3">Variance</th><th className="px-3 py-3">Status</th><th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {variance.map((v) => (
                  <tr key={v.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <td className="px-3 py-3">{v.batch_no}</td>
                    <td className="px-3 py-3">{v.finished_product}</td>
                    <td className="px-3 py-3">{v.planned_qty} / {v.accepted_output_qty} {v.output_unit_name}</td>
                    <td className="px-3 py-3">{Number(v.variance_summary?.yield_pct_accepted || 0).toFixed(1)}%</td>
                    <td className="px-3 py-3">₹{Number((v.variance_summary?.total_actual_cost || 0) - (v.variance_summary?.total_standard_cost || 0)).toFixed(2)}</td>
                    <td className="px-3 py-3"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${v.variance_status === "High Variance" ? "bg-[#FCE7E7] text-[#EA5455]" : "bg-[#DDF6E8] text-[#28C76F]"}`}>{v.variance_status}</span></td>
                    <td className="px-3 py-3"><button onClick={() => openDetail(v)} className={`rounded p-1.5 ${isDark ? "hover:bg-[#3B405A]" : "hover:bg-[#F3F2F7]"}`} title="Material breakdown"><Eye size={16} className="text-[#7367F0]" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </SectionCard>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewing(null)}>
          <div className={`w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-xl border shadow-xl ${isDark ? "border-[#3B405A] bg-[#2F3349]" : "border-[#EBE9F1] bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between border-b p-4 ${isDark ? "border-[#3B405A]" : "border-[#EBE9F1]"}`}>
              <h3 className="text-lg font-semibold">Batch {viewing.batch?.batch_no} — Material Variance</h3>
              <button onClick={() => setViewing(null)}><X size={20} /></button>
            </div>
            <div className="space-y-4 p-4 text-[13px]">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <p><strong>Std Cost:</strong> ₹{Number(viewing.variance?.total_standard_cost || 0).toFixed(2)}</p>
                <p><strong>Actual Cost:</strong> ₹{Number(viewing.variance?.total_actual_cost || 0).toFixed(2)}</p>
                <p><strong>Wastage Value:</strong> ₹{Number(viewing.variance?.total_wastage_value || 0).toFixed(2)}</p>
                <p><strong>Unit Cost:</strong> ₹{Number(viewing.variance?.finished_unit_cost || 0).toFixed(2)}</p>
              </div>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className={`border-b text-left ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                    <th className="px-2 py-2">Material</th><th className="px-2 py-2 text-right">Theoretical</th><th className="px-2 py-2 text-right">Actual</th><th className="px-2 py-2 text-right">Variance</th><th className="px-2 py-2 text-right">Variance %</th><th className="px-2 py-2 text-right">Variance Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewing.variance?.material_variance || []).map((m) => (
                    <tr key={m.raw_material_id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                      <td className="px-2 py-2">{m.material_name}</td>
                      <td className="px-2 py-2 text-right">{Number(m.theoretical_qty).toFixed(2)} {m.base_unit_name}</td>
                      <td className="px-2 py-2 text-right">{Number(m.actual_qty).toFixed(2)}</td>
                      <td className={`px-2 py-2 text-right ${m.variance_qty > 0 ? "text-rose-500" : "text-emerald-500"}`}>{Number(m.variance_qty).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right">{Number(m.variance_pct).toFixed(1)}%</td>
                      <td className="px-2 py-2 text-right">₹{Number(m.variance_value).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(viewing.wastage || []).length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium">Related Wastage</h4>
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className={`border-b text-left ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                        <th className="px-2 py-2">Material</th><th className="px-2 py-2">Scope</th><th className="px-2 py-2 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.wastage.map((w) => (
                        <tr key={w.id} className={`border-b ${isDark ? "border-[#3B405A]" : "border-[#F3F2F7]"}`}>
                          <td className="px-2 py-2">{w.material_name}</td>
                          <td className="px-2 py-2">{w.wastage_type}</td>
                          <td className="px-2 py-2 text-right">₹{Number(w.value || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
