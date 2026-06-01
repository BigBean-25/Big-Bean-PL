export const generateToken = (user, jwtSecret, jwtExpire) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role_name },
    jwtSecret,
    { expiresIn: jwtExpire }
  );
};

export const convertUnit = (qty, fromUnit, toUnit) => {
  const conversions = {
    'kg_grams': 1000,
    'grams_kg': 0.001,
    'litre_ml': 1000,
    'ml_litre': 0.001,
    'no_pcs': 1,
    'nos_pcs': 1,
    'pic_pcs': 1,
    'pics_pcs': 1
  };

  fromUnit = fromUnit.toLowerCase();
  toUnit = toUnit.toLowerCase();

  if (fromUnit === toUnit) return qty;

  const conversionKey = `${fromUnit}_${toUnit}`;
  const factor = conversions[conversionKey];

  if (factor) {
    return qty * factor;
  }

  return qty;
};

export const calculateWeightedAverage = (items) => {
  if (!items || items.length === 0) return 0;
  
  let totalValue = 0;
  let totalQty = 0;

  items.forEach(item => {
    totalValue += (item.qty || 0) * (item.rate || 0);
    totalQty += (item.qty || 0);
  });

  return totalQty > 0 ? totalValue / totalQty : 0;
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount || 0);
};

export const formatDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseExcelDate = (excelDate) => {
  if (!excelDate) return null;
  
  if (typeof excelDate === 'string') {
    return excelDate;
  }
  
  if (typeof excelDate === 'number') {
    const date = new Date((excelDate - 25569) * 86400 * 1000);
    return formatDate(date);
  }
  
  return null;
};

export const sanitizeString = (str) => {
  if (!str) return '';
  return String(str).trim().replace(/\s+/g, ' ');
};

export const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const num = parseFloat(String(value).replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

export const generateUploadBatchId = () => {
  return `UPL-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
};

export const getMonthName = (monthNumber) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthNumber - 1] || '';
};

export const getFinancialYear = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  
  if (month >= 4) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
};

export const validateRequired = (fields, data) => {
  const errors = [];
  
  fields.forEach(field => {
    if (!data[field] && data[field] !== 0) {
      errors.push(`${field} is required`);
    }
  });
  
  return errors;
};

export const paginateResults = (page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  return { limit: parseInt(limit), offset: parseInt(offset) };
};
