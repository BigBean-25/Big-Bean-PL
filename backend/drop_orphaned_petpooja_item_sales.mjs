// One-off cleanup: drops the orphaned petpooja_item_sales table (singular
// "item") - a differently-shaped duplicate of the real petpooja_sales_items
// table, created by database/role_outlet_security_migration.sql, only ever
// read by sampleOutletFilteredController.js (deleted - was never wired to
// a route). Safe: nothing else in the codebase references this table.
import dotenv from 'dotenv';
dotenv.config();
import { getConnection } from './src/config/database.js';

const conn = await getConnection();
let finalMessage = '';
try {
  const [[{ cnt: before }]] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'petpooja_item_sales'"
  );
  if (before === 0) {
    finalMessage = 'RESULT: petpooja_item_sales did not exist - nothing to drop.';
  } else {
    const [[{ row_count }]] = await conn.query('SELECT COUNT(*) AS row_count FROM petpooja_item_sales');
    await conn.execute('DROP TABLE petpooja_item_sales');
    const [[{ cnt: after }]] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'petpooja_item_sales'"
    );
    finalMessage = after === 0
      ? `RESULT: dropped petpooja_item_sales successfully (had ${row_count} row(s)). Verified gone.`
      : `RESULT: DROP ran but table still shows as existing - something is wrong, investigate before assuming success.`;
  }
} catch (e) {
  finalMessage = `RESULT: ERROR - ${e.message || e}`;
} finally {
  conn.release();
}

// Write the result to a file too, since stdout can get cut off by
// process.exit() racing the write on some Windows terminals - this way the
// outcome is verifiable even if the console line above never appears.
const { writeFileSync } = await import('fs');
writeFileSync('drop_orphaned_petpooja_item_sales.result.txt', finalMessage + '\n');
console.log(finalMessage);
await new Promise((resolve) => setTimeout(resolve, 200));
process.exit(0);
