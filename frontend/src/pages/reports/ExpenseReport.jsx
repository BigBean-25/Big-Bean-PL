import { useState, useEffect } from 'react';
import { Download, Search } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const ExpenseReport = () => {
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
      const response = await reportAPI.getExpenseReport(filters);
      setReportData(response.data.data || []);
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
    }
  };

  const totalExpenses = reportData.reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Expense Report</h1>
        <p className="text-gray-600 mt-1">View and analyze daily cash expenses</p>
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
          <h3 className="text-lg font-semibold mb-4">Expense Summary by Head</h3>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Expense Head</th>
                  <th>No. of Entries</th>
                  <th>Total Amount</th>
                  <th>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((item, index) => (
                  <tr key={index}>
                    <td className="font-medium">{item.head_name}</td>
                    <td>{item.entry_count}</td>
                    <td className="font-medium">₹{parseFloat(item.total_amount || 0).toFixed(2)}</td>
                    <td>{((parseFloat(item.total_amount || 0) / totalExpenses) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan="2" className="text-right">Total Expenses:</td>
                  <td colSpan="2">₹{totalExpenses.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseReport;
