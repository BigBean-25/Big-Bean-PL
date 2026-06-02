import { useState, useEffect } from 'react';
import { Download, Search } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';

const ActualConsumptionReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [filters, setFilters] = useState({
    outlet_id: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  useEffect(() => {
    fetchOutlets();
  }, []);

  const fetchOutlets = async () => {
    try {
      const response = await masterAPI.getOutlets();
      setOutlets(response.data.data);
    } catch (error) {
      console.error('Failed to fetch outlets');
    }
  };

  const handleGenerateReport = async () => {
    if (!filters.outlet_id) {
      toast.error('Please select an outlet');
      return;
    }
    try {
      const response = await reportAPI.getActualConsumption(filters);
      setReportData(response.data.data || []);
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
    }
  };

  const totalConsumption = reportData.reduce((sum, item) => sum + parseFloat(item.consumption_value || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Actual Consumption Report</h1>
        <p className="text-gray-600 mt-1">View actual raw material consumption</p>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Outlet *</label>
            <select value={filters.outlet_id} onChange={(e) => setFilters({ ...filters, outlet_id: e.target.value })} className="input-field">
              <option value="">Select Outlet</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.outlet_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Month *</label>
            <select value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })} className="input-field">
              {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{new Date(2000, i).toLocaleString('default', { month: 'long' })}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Year *</label>
            <input type="number" value={filters.year} onChange={(e) => setFilters({ ...filters, year: e.target.value })} className="input-field" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={handleGenerateReport} className="btn-primary flex items-center gap-2">
              <Search size={18} />
              Generate
            </button>
            <button className="btn-secondary flex items-center gap-2">
              <Download size={18} />
              Export
            </button>
          </div>
        </div>
      </div>

      {reportData.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Consumption Details</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Opening Stock</th>
                  <th>Purchases</th>
                  <th>Closing Stock</th>
                  <th>Consumption Qty</th>
                  <th>Avg Rate</th>
                  <th>Consumption Value</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((item, index) => (
                  <tr key={index}>
                    <td className="font-medium">{item.material_name}</td>
                    <td>{parseFloat(item.opening_qty || 0).toFixed(2)}</td>
                    <td>{parseFloat(item.purchase_qty || 0).toFixed(2)}</td>
                    <td>{parseFloat(item.closing_qty || 0).toFixed(2)}</td>
                    <td className="font-medium">{parseFloat(item.consumption_qty || 0).toFixed(2)}</td>
                    <td>₹{parseFloat(item.avg_rate || 0).toFixed(2)}</td>
                    <td className="font-medium">₹{parseFloat(item.consumption_value || 0).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan="6" className="text-right">Total Consumption Value:</td>
                  <td>₹{totalConsumption.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActualConsumptionReport;
