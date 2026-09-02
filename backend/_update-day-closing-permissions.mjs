import 'dotenv/config';
import mysql from 'mysql2/promise';

const config = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bigbeancafe_db',
  port: Number(process.env.DB_PORT) || 3306,
};

async function run() {
  const conn = await mysql.createConnection(config);
  try {
    const [result] = await conn.execute(
      `UPDATE role_permissions rp
       JOIN roles r ON rp.role_id = r.id
       SET rp.can_view = 1, rp.can_create = 1, rp.can_edit = 1, rp.can_submit = 1,
           rp.can_delete = 0, rp.can_upload = 0, rp.can_verify = 0, rp.can_approve = 0,
           rp.can_reject = 0, rp.can_lock = 0, rp.can_export = 0, rp.is_read_only = 0
       WHERE r.role_name = 'Outlet Admin' AND rp.module_key = 'day_closing'`
    );
    console.log(JSON.stringify({ updated: result.affectedRows }, null, 2));
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
