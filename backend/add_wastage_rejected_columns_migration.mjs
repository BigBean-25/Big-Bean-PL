import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

// rejectProductionWastage() used to reuse approved_by/approved_at to record who
// rejected a record, which made an Approved record and a Rejected record
// indistinguishable in the audit trail except via the status column. Adding
// dedicated columns so rejection has its own audit trail, matching every other
// transition (submitted_by/at, verified_by/at, approved_by/at, locked_by/at).
const conn = await getConnection();
try {
  await conn.beginTransaction();

  const [existing] = await conn.execute("SHOW COLUMNS FROM production_wastage LIKE 'rejected_by'");
  if (existing.length === 0) {
    await conn.execute(
      `ALTER TABLE production_wastage
       ADD COLUMN rejected_by INT NULL AFTER approved_at,
       ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by`
    );
    console.log('Added rejected_by / rejected_at to production_wastage');
  } else {
    console.log('rejected_by / rejected_at already exist, skipping');
  }

  await conn.commit();
  console.log('Migration completed');
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
  process.exit(0);
}
