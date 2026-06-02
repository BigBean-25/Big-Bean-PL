import { useState, useEffect } from 'react';
import { Download, Search } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const DailyCashbookReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState([]);
  const [filters, setFilters] = useState({
    outlet_id: '',
    from_date: format(new Date(), 'yyyy-MM-dd'),
    to_date: format(new Date(), 'yyyy-MM-dd')
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
      const response = await reportAPI.getDailyCashbook(filters);
      setReportData(response.data.data || []);
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Daily Cashbook Report</h1>
        <p className="text-gray-600 mt-1">View daily cashbook entries and summaries</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">From Date *</label>
            <input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">To Date *</label>
            <input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} className="input-field" />
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
          <h3 className="text-lg font-semibold mb-4">Cashbook Entries</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Cash Sales</th>
                  <th>Card Sales</th>
                  <th>UPI Sales</th>
                  <th>Online Sales</th>
                  <th>Total Sales</th>
                  <th>Cash Difference</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((entry, index) => (
                  <tr key={index}>
                    <td>{format(new Date(entry.cashbook_date), 'dd MMM yyyy')}</td>
                    <td>₹{parseFloat(entry.cash_sales || 0).toFixed(2)}</td>
                    <td>₹{parseFloat(entry.card_sales || 0).toFixed(2)}</td>
                    <td>₹{parseFloat(entry.upi_sales || 0).toFixed(2)}</td>
                    <td>₹{parseFloat(entry.online_sales || 0).toFixed(2)}</td>
                    <td className="font-medium">₹{parseFloat(entry.total_sales || 0).toFixed(2)}</td>
                    <td className={parseFloat(entry.cash_difference || 0) < 0 ? 'text-red-600' : 'text-green-600'}>
                      ₹{parseFloat(entry.cash_difference || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyCashbookReport;
