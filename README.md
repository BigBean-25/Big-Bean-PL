# BIG BEAN CAFÉ – OUTLET ACCOUNTS, STOCK, CONSUMPTION & P&L CONTROL SYSTEM

A comprehensive full-stack web application for managing multi-outlet café operations including daily accounts, inventory, purchases, sales, recipe management, and profit & loss reporting.

## 🎯 Overview

This production-ready system manages:
- **Daily Outlet Accounts**: Cashbook, expenses, bank deposits, day closing
- **Stock Management**: Opening/closing stock with Excel upload
- **Purchase Management**: Material purchases with PetPooja format support
- **Sales Tracking**: Item-wise sales upload and analysis
- **Recipe/BOM**: Complete recipe management with versioning
- **Payouts**: Online and dine-in portal payout reconciliation
- **P&L Reports**: Comprehensive profit & loss with proper calculation logic
- **Multi-outlet Support**: 7 outlets (RR Nagar, Koramangala, HSR Layout, M5 E-City, Jayanagar, Indiranagar, Kammanahalli)

## 🏗️ Technology Stack

### Backend
- **Framework**: Node.js + Express.js
- **Database**: MySQL 8.0+
- **Authentication**: JWT (JSON Web Tokens)
- **File Upload**: Multer
- **Excel Parsing**: xlsx (supports .xls and .xlsx)
- **Excel Export**: ExcelJS
- **PDF Export**: Puppeteer
- **Validation**: Joi
- **Security**: Helmet, CORS, Rate Limiting

### Frontend
- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Routing**: React Router DOM v6
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Charts**: Recharts
- **Icons**: Lucide React
- **Notifications**: React Hot Toast
- **Date Handling**: date-fns

## 📋 Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+
- Git

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd "Big Bean Consmption"
```

### 2. Database Setup

```bash
# Login to MySQL
mysql -u root -p

# Create database and import schema
source database/schema.sql

# Import seed data
source database/seed.sql
```

**Note**: Update the MySQL password in seed.sql if needed. Default users use password: `Admin@123`

### 3. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your configuration
# Update DB_PASSWORD with your MySQL password
```

**Backend .env Configuration:**
```env
NODE_ENV=development
PORT=5000

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=bigbean_cafe
DB_PORT=3306

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRE=7d

UPLOAD_PATH=./uploads
MAX_FILE_SIZE=10485760

FRONTEND_URL=http://localhost:5173
```

### 4. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

**Frontend .env Configuration:**
```env
VITE_API_URL=http://localhost:5000/api
```

### 5. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000/api
- **Health Check**: http://localhost:5000/api/health

## 👥 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Developer | developer@bigbean.local | Admin@123 |
| Super Admin | superadmin@bigbean.local | Admin@123 |
| Admin/Accountant | admin@bigbean.local | Admin@123 |
| Outlet Admin | outletadmin@bigbean.local | Admin@123 |
| Outlet Staff | staff@bigbean.local | Admin@123 |

## 📊 Key Features

### 1. Role-Based Access Control

- **Developer**: Full system access including technical configuration
- **Super Admin**: Owner/head office control, all outlets and reports
- **Admin/Accountant**: Verify entries, upload data, generate reports
- **Outlet Admin**: Daily entries and outlet-level reports
- **Outlet Staff**: Limited access for daily entries only

### 2. Daily Cashbook (Manual Entry)

**Fields:**
- Opening cash, Cash sales, Card sales, UPI sales
- Platform-wise sales (Zomato, Swiggy, Own App, Ownly, Dineout, etc.)
- Cash expenses (auto-pulled from approved expenses)
- Bank deposits, Cash transfer to HO
- Actual cash in hand, Cash difference (auto-calculated)
- Status workflow: Draft → Submitted → Verified/Rejected → Locked

**Formula:**
```
Closing Cash = Opening Cash + Cash Sales - Cash Expenses - Bank Deposit - Cash Transfer to HO
Cash Difference = Actual Cash in Hand - Closing Cash
```

### 3. Stock Management (Excel Upload)

**Opening Stock & Closing Stock:**
- Monthly Excel upload (.xls/.xlsx supported)
- Fields: Date, Outlet, Raw Material, Qty, Unit, Rate, Value
- Preview before import
- Validation and error reporting
- Upload history with rollback option

### 4. Material Purchase Upload

**Supports PetPooja Format:**
- Auto-detects outlet from filename or allows manual selection
- Maps: Date, Supplier, Material, Qty, Unit, Rate, Tax, Amount, Invoice No
- Stores original row as JSON for audit
- Supplier and material auto-matching
- Error logging for failed rows

### 5. Item-wise Sales Upload

**Supports PetPooja Format:**
- Fields: Date, Category, Item, Qty Sold, Gross Sales, Discount, Tax, Net Sales
- Menu item auto-matching
- Missing recipe detection
- Platform and payment mode tracking

### 6. Recipe/BOM Management

**Recipe Header:**
- Menu item, Category, Portion, Prep/Cooking/Finishing time
- Outlet-specific or global recipes
- Version control with effective dates

**Recipe Ingredients:**
- Raw material, Qty per item, Unit, Waste %, Extra cost
- Unit conversion support (kg/grams, litre/ml, pcs)

**Example:**
```
Cappuccino:
- Coffee Beans: 18 grams
- Milk: 200 ml
- Sugar: 10 grams
```

### 7. Consumption Calculation

**Actual Consumption:**
```
Actual Consumption = Opening Stock + Purchases - Closing Stock
```

**Theoretical Consumption:**
```
Theoretical Consumption = Sales Qty × Recipe Qty
```

**Variance:**
```
Variance = Actual - Theoretical
Variance % = (Variance / Theoretical) × 100
```

### 8. Monthly P&L Calculation

**Revenue:**
```
Gross Sales
- Discounts
- Taxes
- Online Commission
- Payment Gateway Charges
- TCS/TDS
= Net Sales / Adjusted Sales
```

**Cost of Goods:**
```
Opening Stock
+ Purchases
- Closing Stock
= Actual Raw Material Consumption
```

**Operating Expenses:**
- Daily cash expenses (approved only)
- Electricity, Water, Maintenance, Internet, Gas
- Employee salary, Incentives, Accommodation
- Other operating costs

**Profit/Loss:**
```
Net Sales
- Actual Raw Material Consumption
- Daily Cash Expenses
- Utilities
- Employee Salary
- Other Operating Expenses
= Profit / Loss
```

**Key Ratios:**
- Food Cost % = (Consumption / Net Sales) × 100
- Salary Cost % = (Salary / Net Sales) × 100
- Net Profit % = (Profit / Net Sales) × 100

**IMPORTANT:**
- ✅ Supplier payments are NOT deducted in P&L (already in purchases)
- ✅ Bank deposits are NOT deducted in P&L (cash movement only)
- ✅ Only approved daily cash expenses affect P&L

### 9. Online & Dine-in Payouts

**Online Platforms:** Swiggy, Zomato, Own App, Ownly

**Dine-in Portals:** Swiggy Dineout, Zomato Dining, District, EazyDiner

**Payout Formula:**
```
Net Payout Expected = Customer Paid - Commission - PG Charges - TCS - TDS - Other Deductions
Difference = Actual Payout Received - Net Payout Expected
```

### 10. Approval Workflow

**Daily Cash Expenses:**
- Draft → Submitted → Approved/Rejected
- Proof attachment required (JPG, PNG, WEBP, PDF)
- Admin verification with remarks

**Day Closing:**
- Open → Submitted → Verified/Rejected → Locked
- Confirms: Sales, Expenses, Purchases, Proofs uploaded
- After locked, outlet staff cannot edit

## 📁 Project Structure

```
bigbean-cafe-control-system/
├── backend/
│   ├── src/
│   │   ├── config/          # Database, Multer configuration
│   │   ├── controllers/     # Business logic
│   │   ├── middleware/      # Auth, error handling
│   │   ├── routes/          # API routes
│   │   ├── utils/           # Helpers, logger
│   │   ├── app.js           # Express app
│   │   └── server.js        # Server entry point
│   ├── uploads/             # File uploads storage
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── layouts/         # Dashboard layout
│   │   ├── pages/           # All pages
│   │   ├── services/        # API services
│   │   ├── store/           # Zustand state
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── database/
│   ├── schema.sql           # Database schema
│   └── seed.sql             # Seed data
├── templates/               # Excel templates (to be created)
└── README.md
```

## 🗄️ Database Schema

**Key Tables:**
- `users`, `roles`, `user_outlets`
- `outlets`, `categories`, `suppliers`, `raw_materials`, `menu_items`
- `daily_cashbooks`, `daily_cash_expenses`, `bank_deposits`, `day_closings`
- `opening_stock_uploads`, `opening_stock_items`
- `closing_stock_uploads`, `closing_stock_items`
- `material_purchase_uploads`, `material_purchase_items`
- `item_sales_uploads`, `item_sales_items`
- `recipes`, `recipe_items`, `recipe_versions`
- `online_payouts`, `dine_in_payouts`
- `utility_bills`, `employee_salary_monthly`
- `supplier_payments`
- `consumption_runs`, `actual_consumption_items`, `theoretical_consumption_items`
- `audit_logs`, `approval_logs`, `upload_error_logs`

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password

### Masters
- `GET/POST/PUT/DELETE /api/masters/outlets`
- `GET/POST/PUT/DELETE /api/masters/categories`
- `GET/POST/PUT/DELETE /api/masters/suppliers`
- `GET/POST/PUT/DELETE /api/masters/raw-materials`
- `GET/POST/PUT/DELETE /api/masters/menu-items`
- `GET /api/masters/units`
- `GET /api/masters/expense-heads`
- `GET /api/masters/payment-modes`
- `GET /api/masters/online-platforms`
- `GET /api/masters/dine-in-portals`

### Daily Accounts
- `GET/POST/PUT /api/daily-accounts/cashbooks`
- `POST /api/daily-accounts/cashbooks/:id/verify`
- `GET/POST /api/daily-accounts/expenses`
- `POST /api/daily-accounts/expenses/:id/approve`
- `POST /api/daily-accounts/bank-deposits`
- `POST /api/daily-accounts/day-closing`
- `POST /api/daily-accounts/day-closing/:id/verify`

### Uploads
- `POST /api/uploads/opening-stock` - Upload opening stock Excel
- `POST /api/uploads/closing-stock` - Upload closing stock Excel
- `POST /api/uploads/material-purchase` - Upload purchase Excel
- `POST /api/uploads/item-sales` - Upload sales Excel
- `GET /api/uploads/history` - Upload history
- `GET /api/uploads/errors/:upload_id` - Upload errors

### Recipes
- `GET/POST/PUT /api/recipes` - Recipe management
- `GET /api/recipes/:id` - Get recipe with items

### Payouts
- `GET/POST /api/payouts/online` - Online payouts
- `GET/POST /api/payouts/dine-in` - Dine-in payouts

### Reports
- `GET /api/reports/monthly-pl` - Monthly P&L report
- `GET /api/reports/actual-consumption` - Actual consumption
- `GET /api/reports/theoretical-consumption` - Theoretical consumption
- `GET /api/reports/daily-cashbook` - Cashbook report
- `GET /api/reports/expenses` - Expense report

## 📤 Excel Upload Format

### Opening/Closing Stock Template

| Date | Material Name | Qty | Unit | Rate | Remarks |
|------|--------------|-----|------|------|---------|
| 2024-05-01 | Coffee Beans | 50 | kg | 800 | |
| 2024-05-01 | Milk | 100 | litre | 60 | |

### Material Purchase Template

| Date | Supplier | Material Name | Qty | Unit | Rate | Amount | Invoice No |
|------|----------|--------------|-----|------|------|--------|------------|
| 2024-05-15 | Fresh Dairy | Milk | 50 | litre | 60 | 3000 | INV-001 |

### Item Sales Template

| Date | Category | Item Name | Qty | Gross Sales | Discount | Tax | Net Sales |
|------|----------|-----------|-----|-------------|----------|-----|-----------|
| 2024-05-15 | Beverages | Cappuccino | 45 | 5400 | 0 | 270 | 5130 |

## 🐛 Troubleshooting

### Database Connection Error
```bash
# Check MySQL is running
mysql -u root -p

# Verify database exists
SHOW DATABASES;

# Check .env DB credentials match
```

### Port Already in Use
```bash
# Backend (5000)
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Frontend (5173)
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Upload Errors
- Ensure `uploads/` directory exists with proper permissions
- Check file size limit (default 10MB)
- Verify Excel file format (.xls or .xlsx)
- Check column names match expected format

### JWT Token Expired
- Clear browser localStorage
- Login again to get new token

## 🔒 Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Role-based access control
- SQL injection prevention (parameterized queries)
- XSS protection (Helmet)
- CORS configuration
- Rate limiting
- File upload validation
- Audit logging

## 📝 Important Notes

### P&L Calculation Rules

1. **Supplier Payments**: These are ledger payments only. Do NOT deduct from P&L as purchases are already included in consumption.

2. **Bank Deposits**: Cash movement only. Do NOT deduct from P&L.

3. **Cash Expenses**: Only APPROVED expenses affect P&L.

4. **Online Sales**: If item-wise sales already includes online sales in gross sales, do not add online payout as extra revenue. Use payout entries for deduction reconciliation only.

5. **Consumption**: Use ACTUAL consumption (Opening + Purchase - Closing) for P&L, not theoretical.

### Upload Best Practices

- Always download and use provided templates
- Ensure outlet is selected before upload
- Preview data before confirming import
- Check error logs for failed rows
- Keep backup of original Excel files

### Day Closing Workflow

1. Outlet staff enters daily data
2. Outlet admin reviews and submits day closing
3. Admin/Super Admin verifies
4. After verification, day is locked
5. Only Super Admin can unlock if needed

## 🚀 Production Deployment

### Backend
```bash
cd backend
npm install --production
NODE_ENV=production npm start
```

### Frontend
```bash
cd frontend
npm run build
# Serve dist/ folder with nginx or similar
```

### Environment Variables
- Change `JWT_SECRET` to a strong random string
- Update `DB_PASSWORD` with production credentials
- Set `NODE_ENV=production`
- Configure proper `FRONTEND_URL`

## 📞 Support

For issues or questions:
1. Check this README
2. Review API documentation
3. Check audit logs for errors
4. Contact system administrator

## 📄 License

Proprietary - Big Bean Café

---

**Built with ☕ for Big Bean Café**

*Version 1.0.0 - May 2024*
