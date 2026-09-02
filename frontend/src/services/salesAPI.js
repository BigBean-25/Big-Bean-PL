import api from "./api";

const getFileName = (disposition) => {
  if (!disposition) return null;
  const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
  return match ? match[1].replace(/['"]/g, "") : null;
};

const downloadBlob = async (url, defaultName) => {
  const response = await api.get(url, {
    responseType: "blob",
  });
  const blob = new Blob([response.data]);
  const link = document.createElement("a");
  const filename = getFileName(response.headers["content-disposition"]) || defaultName;
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  return filename;
};

export const salesAPI = {
  getReconciliations: (params = {}) =>
    api.get(`/sales/reconciliation`, {
      params,
    }),

  getReconciliationById: (id) =>
    api.get(`/sales/reconciliation/${id}`),

  downloadPetPoojaTemplate: () =>
    downloadBlob(`/sales/petpooja-template`, "PetPooja_Sales_Template.xlsx"),

  downloadOriginal: (uploadId, defaultName) =>
    downloadBlob(
      `/sales/petpooja-upload/${uploadId}/original`,
      defaultName || `original-${uploadId}.xlsx`
    ),

  downloadProcessed: (uploadId, defaultName) =>
    downloadBlob(
      `/sales/petpooja-upload/${uploadId}/processed`,
      defaultName || `processed-${uploadId}.xlsx`
    ),

  downloadErrorReport: (reconciliationId, defaultName) =>
    downloadBlob(
      `/sales/reconciliation/${reconciliationId}/error-report-excel`,
      defaultName || `reconciliation-${reconciliationId}-errors.xlsx`
    ),

  approveReconciliation: (id) =>
    api.post(`/sales/reconciliation/${id}/approve`, {}),

  rejectReconciliation: (id, reason) =>
    api.post(`/sales/reconciliation/${id}/reject`, { reason }),

  rollbackPetPoojaUpload: (uploadId) =>
    api.delete(`/sales/petpooja-upload/${uploadId}`),

  uploadMonthly: (formData) =>
    api.post(`/sales/petpooja-upload/monthly`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  // Item Wise Tax Report - a supplementary upload carrying PetPooja's real
  // per-item CGST/SGST split, used to make GSTR-1 precise instead of estimated.
  downloadItemTaxTemplate: () =>
    downloadBlob(`/sales/item-tax-template`, "PetPooja_Item_Tax_Report_Template.xlsx"),

  uploadItemTaxReport: (formData) =>
    api.post(`/sales/item-tax-upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getItemTaxUploads: (params = {}) =>
    api.get(`/sales/item-tax-uploads`, {
      params,
    }),

  getItemTaxUploadById: (id) =>
    api.get(`/sales/item-tax-uploads/${id}`),

  deleteItemTaxUpload: (id) =>
    api.delete(`/sales/item-tax-uploads/${id}`),
};
