import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bigbeancafe_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// A pooled connection the DB server closes server-side (idle timeout, network
// blip) surfaces as an 'error' event on the pool itself, not on any in-flight
// query. With no listener, Node's default EventEmitter behavior is to throw
// it as an uncaught exception and crash the whole process - severing every
// other request on the way down. Logging it here lets mysql2 quietly drop
// the dead connection and open a new one on the next query, as designed.
pool.on('error', (error) => {
  console.error('MySQL pool error:', error.code || error.message);
});

export const query = async (sql, params) => {
  const [results] = await pool.execute(sql, params);
  return results;
};

export const getConnection = async () => {
  return await pool.getConnection();
};

export const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

export default pool;
