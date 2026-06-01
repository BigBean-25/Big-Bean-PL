import { useState, useEffect } from 'react';
import { Upload, Download, Eye, AlertCircle } from 'lucide-react';
import { uploadAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ItemSalesUpload = () => {
  const [uploads, setUploads] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [formData, setFormData] = useState({
    outlet_id: '',
    sales_date: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    fetchUploads();
    fetchOutlets();
  }, []);

  const fetchUploads = async () => {
    try {
      const response = await uploadAPI.getUploadHistory('item_sales');
      setUploads(response.data.data || []);
    } catch (error) {
      toast.error('Failed to fetch upload history');
    }
  };

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      setOutlets(response.data.data);
    } catch (error) {
      console.error('Failed to fetch outlets');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a valid Excel file (.xls or .xlsx)');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    const uploadData = new FormData();
    uploadData.append('file', selectedFile);
    uploadData.append('outlet_id', formData.outlet_id);
    uploadData.append('sales_date', formData.sales_date);

    try {
      await uploadAPI.uploadItemSales(uploadData);
      toast.success('Item sales uploaded successfully');
      setSelectedFile(null);
      fetchUploads();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'Pending': 'badge-secondary',
      'Processing': 'badge-warning',
      'Completed': 'badge-success',
      'Failed': 'badge-danger'
    };
    return <span className={`badge ${colors[status]}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item-wise Sales Upload</h1>
          <p className="text-gray-600 mt-1">Upload item-wise sales data from PetPooja</p>
        </div>
        <button className="btn-secondary flex items-center gap-2">
          <Download size={20} />
          Download Template
        </button>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Upload Item Sales</h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Outlet *</label>
              <select value={formData.outlet_id} onChange={(e) => setFormData({ ...formData, outlet_id: e.target.value })} className="input-field" required>
                <option value="">Select Outlet</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sales Date *</label>
              <input type="date" value={formData.sales_date} onChange={(e) => setFormData({ ...formData, sales_date: e.target.value })} className="input-field" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Excel File (PetPooja Format) *</label>
            <input type="file" accept=".xls,.xlsx" onChange={handleFileChange} className="input-field" required />
            {selectedFile && <p className="text-sm text-gray-600 mt-1">Selected: {selectedFile.name}</p>}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-2">
              <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />
              <div className="text-sm text-blue-800">
                <p className="font-medium">PetPooja Sales Format:</p>
                <p>Columns: Date, Item Name, Category, Qty Sold, Rate, Amount, Platform, Remarks</p>
              </div>
            </div>
          </div>
          <button type="submit" className="btn-primary flex items-center gap-2">
            <Upload size={20} />
            Upload File
          </button>
        </form>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Upload History</h3>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Outlet</th>
                <th>Sales Date</th>
                <th>File</th>
                <th>Rows</th>
                <th>Total Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{format(new Date(upload.created_at), 'dd MMM yyyy HH:mm')}</td>
                  <td>{upload.outlet_name}</td>
                  <td>{format(new Date(upload.sales_date), 'dd MMM yyyy')}</td>
                  <td className="text-sm">{upload.file_name}</td>
                  <td>
                    <span className="text-green-600">{upload.success_rows}</span> / 
                    <span className="text-red-600">{upload.failed_rows}</span> / 
                    <span className="text-gray-600">{upload.total_rows}</span>
                  </td>
                  <td className="font-medium">₹{parseFloat(upload.total_amount || 0).toFixed(2)}</td>
                  <td>{getStatusBadge(upload.status)}</td>
                  <td>
                    <button className="text-blue-600 hover:text-blue-800" title="View Details">
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ItemSalesUpload;
