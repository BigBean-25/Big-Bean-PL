import { query, getConnection } from '../backend/src/config/database.js';

const conn = await getConnection();
try {
  await conn.beginTransaction();

  const transferCols = await conn.execute("SHOW COLUMNS FROM stock_transfers LIKE 'production_request_id'");
  if (transferCols[0].length === 0) {
    await conn.execute('ALTER TABLE stock_transfers ADD COLUMN production_request_id INT NULL AFTER requisition_id, ADD COLUMN production_request_item_id INT NULL AFTER production_request_id');
    console.log('Added production_request_id / production_request_item_id to stock_transfers');
  }

  const itemCols = await conn.execute("SHOW COLUMNS FROM stock_transfer_items LIKE 'production_request_id'");
  if (itemCols[0].length === 0) {
    await conn.execute('ALTER TABLE stock_transfer_items ADD COLUMN production_request_id INT NULL AFTER transfer_id, ADD COLUMN production_request_item_id INT NULL AFTER production_request_id');
    console.log('Added production_request_id / production_request_item_id to stock_transfer_items');
  }

  const reqItemCols = await conn.execute("SHOW COLUMNS FROM production_request_items LIKE 'dispatched_qty'");
  if (reqItemCols[0].length === 0) {
    await conn.execute(`ALTER TABLE production_request_items
      ADD COLUMN allocated_qty DECIMAL(15,4) DEFAULT 0 AFTER planned_qty,
      ADD COLUMN dispatched_qty DECIMAL(15,4) DEFAULT 0 AFTER allocated_qty,
      ADD COLUMN received_qty DECIMAL(15,4) DEFAULT 0 AFTER dispatched_qty,
      ADD COLUMN short_qty DECIMAL(15,4) DEFAULT 0 AFTER received_qty,
      ADD COLUMN damaged_qty DECIMAL(15,4) DEFAULT 0 AFTER short_qty,
      ADD COLUMN cancelled_qty DECIMAL(15,4) DEFAULT 0 AFTER damaged_qty`);
    console.log('Added fulfilment columns to production_request_items');
  }

  const reqCols = await conn.execute("SHOW COLUMNS FROM production_requests LIKE 'allocated_qty'");
  if (reqCols[0].length === 0) {
    await conn.execute(`ALTER TABLE production_requests
      ADD COLUMN allocated_qty DECIMAL(15,4) DEFAULT 0 AFTER status,
      ADD COLUMN dispatched_qty DECIMAL(15,4) DEFAULT 0 AFTER allocated_qty,
      ADD COLUMN received_qty DECIMAL(15,4) DEFAULT 0 AFTER dispatched_qty,
      ADD COLUMN short_qty DECIMAL(15,4) DEFAULT 0 AFTER received_qty,
      ADD COLUMN damaged_qty DECIMAL(15,4) DEFAULT 0 AFTER short_qty,
      ADD COLUMN cancelled_qty DECIMAL(15,4) DEFAULT 0 AFTER damaged_qty`);
    console.log('Added fulfilment columns to production_requests');
  }

  // Permission modules
  const permRows = await conn.execute("SELECT id FROM role_permissions WHERE module_key = 'production_dispatch' LIMIT 1");
  if (permRows[0].length === 0) {
    const roles = await conn.execute("SELECT id FROM roles WHERE role_name IN ('Super Admin','Admin','Developer')");
    for (const role of roles[0]) {
      await conn.execute(`INSERT INTO role_permissions
        (role_id, module_key, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_submit, can_verify, can_approve, can_reject, can_lock, can_export, is_read_only)
        VALUES (?, 'production_dispatch', 'Production Dispatch', 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0)`, [role.id]);
    }
    console.log('Added production_dispatch permissions');
  }

  await conn.commit();
  console.log('Phase 3C dispatch migration completed');
} catch (e) {
  await conn.rollback();
  throw e;
} finally {
  conn.release();
}
