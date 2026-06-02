import app from './app.js';
import { testConnection } from './config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      console.error('❌ Failed to connect to database. Please check your configuration.');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║                                                            ║');
      console.log('║          🍵 BIG BEAN CAFÉ CONTROL SYSTEM 🍵                ║');
      console.log('║                                                            ║');
      console.log('║  Outlet Accounts, Stock, Consumption & P&L Control        ║');
      console.log('║                                                            ║');
      console.log('╚════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`📡 API listening on port ${PORT}`);
      console.log(`🌐 API URL: http://localhost:${PORT}/api`);
      console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
      console.log('');
      console.log('Available endpoints:');
      console.log('  - POST /api/auth/login');
      console.log('  - GET  /api/auth/me');
      console.log('  - GET  /api/masters/*');
      console.log('  - GET  /api/daily-accounts/*');
      console.log('  - POST /api/uploads/*');
      console.log('  - GET  /api/reports/*');
      console.log('  - GET  /api/recipes/*');
      console.log('  - GET  /api/payouts/*');
      console.log('');
      console.log('Press Ctrl+C to stop the server');
      console.log('');
    });
  } catch (error) {
    console.error('❌ Error starting server:', error);
    process.exit(1);
  }
};

startServer();
