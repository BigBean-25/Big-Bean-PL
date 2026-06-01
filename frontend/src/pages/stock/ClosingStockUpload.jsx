import { useState, useEffect } from 'react';
import { Upload, Download, Eye, AlertCircle } from 'lucide-react';
import { uploadAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ClosingStockUpload = () => {
  const [uploads, setUploads] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [formData, setFormData] = useState({
    outlet_id: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  useEffect(() => {
    fetchUploads();
    fetchOutlets();
  }, []);

  const fetchUploads = async () => {
    try {
      const response = await uploadAPI.getUploadHistory('closing_stock');
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
    uploadData.append('month', formData.month);
    uploadData.append('year', formData.year);

    try {
      await uploadAPI.uploadClosingStock(uploadData);
      toast.success('Closing stock uploaded successfully');
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
      'Failed': 'badge-danger',
      'Rolled Back': 'badge-secondary'
    };
    return <span className={`badge ${colors[status]}`}>{status}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Closing Stock Upload</h1>
          <p className="text-gray-600 mt-1">Upload monthly closing stock via Excel</p>
        </div>
        <button className="btn-secondary flex items-center gap-2">
          <Download size={20} />
          Download Template
        </button>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Upload Closing Stock</h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Outlet *</label>
              <select value={formData.outlet_id} onChange={(e) => setFormData({ ...formData, outlet_id: e.target.value })} className="input-field" required>
                <option value="">Select Outlet</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Month *</label>
              <select value={formData.month} onChange={(e) => setFormData({ ...formData, month: e.target.value })} className="input-field" required>
                {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Year *</label>
              <input type="number" value={formData.year} onChange={(e) => setFormData({ ...formData, year: e.target.value })} className="input-field" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Excel File *</label>
            <input type="file" accept=".xls,.xlsx" onChange={handleFileChange} className="input-field" required />
            {selectedFile && <p className="text-sm text-gray-600 mt-1">Selected: {selectedFile.name}</p>}
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-2">
              <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />
              <div className="text-sm text-blue-800">
                <p className="font-medium">Excel Format:</p>
                <p>Columns: Date, Material Name, Qty, Unit, Rate, Remarks</p>
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
                <th>Month/Year</th>
                <th>File</th>
                <th>Rows</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{format(new Date(upload.created_at), 'dd MMM yyyy HH:mm')}</td>
                  <td>{upload.outlet_name}</td>
                  <td>{upload.month}/{upload.year}</td>
                  <td className="text-sm">{upload.file_name}</td>
                  <td>
                    <span className="text-green-600">{upload.success_rows}</span> / 
                    <span className="text-red-600">{upload.failed_rows}</span> / 
                    <span className="text-gray-600">{upload.total_rows}</span>
                  </td>
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

export default ClosingStockUpload;
