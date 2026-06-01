import { useState, useEffect } from 'react';
import { Download, Search } from 'lucide-react';
import { reportAPI, masterAPI } from '../../services/api';
import toast from 'react-hot-toast';

const MonthlyPLReport = () => {
  const [outlets, setOutlets] = useState([]);
  const [reportData, setReportData] = useState(null);
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
      const response = await reportAPI.getMonthlyPL(filters);
      setReportData(response.data.data);
      toast.success('Report generated successfully');
    } catch (error) {
      toast.error('Failed to generate report');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Monthly Outlet P&L Report</h1>
        <p className="text-gray-600 mt-1">View detailed profit & loss statement</p>
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

      {reportData && (
        <div className="space-y-4">
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Revenue</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span>Gross Sales</span><span className="font-medium">₹{parseFloat(reportData.gross_sales || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Platform Commissions</span><span className="text-red-600">-₹{parseFloat(reportData.commissions || 0).toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Net Revenue</span><span className="font-semibold">₹{parseFloat(reportData.net_revenue || 0).toFixed(2)}</span></div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Cost of Goods Sold</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span>Opening Stock</span><span>₹{parseFloat(reportData.opening_stock || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Purchases</span><span>₹{parseFloat(reportData.purchases || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Closing Stock</span><span className="text-red-600">-₹{parseFloat(reportData.closing_stock || 0).toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Actual Consumption</span><span className="font-semibold">₹{parseFloat(reportData.consumption || 0).toFixed(2)}</span></div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Operating Expenses</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span>Total Expenses</span><span>₹{parseFloat(reportData.expenses || 0).toFixed(2)}</span></div>
            </div>
          </div>

          <div className="card bg-green-50 border border-green-200">
            <h3 className="text-lg font-semibold text-green-900 mb-4">Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span>Net Revenue</span><span className="font-medium">₹{parseFloat(reportData.net_revenue || 0).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Total Costs</span><span className="text-red-600">-₹{(parseFloat(reportData.consumption || 0) + parseFloat(reportData.expenses || 0)).toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-2 text-lg"><span className="font-bold">Net Profit</span><span className="font-bold text-green-600">₹{parseFloat(reportData.net_profit || 0).toFixed(2)}</span></div>
              <div className="flex justify-between mt-4 pt-4 border-t"><span>Food Cost %</span><span className="font-medium">{parseFloat(reportData.food_cost_percent || 0).toFixed(2)}%</span></div>
              <div className="flex justify-between"><span>Profit Margin %</span><span className="font-medium">{parseFloat(reportData.profit_margin || 0).toFixed(2)}%</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyPLReport;
