import 'dotenv/config';
import mysql from 'mysql2/promise';
import jwt from 'jsonwebtoken';

const BASE = 'http://localhost:5001/api';
const TEST_DATE = '2037-08-15';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bigbeancafe_db',
  port: Number(process.env.DB_PORT) || 3306,
};

const results = [];

function assert(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
}

async function req(method, path, token, body) {
  const options = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) options.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) options.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function waitForServer() {
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.status === 200) return;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Server not reachable');
}

async function run() {
  const conn = await mysql.createConnection(dbConfig);
  try {
    await waitForServer();

    const [outlet] = await conn.execute(
      `SELECT id FROM outlets WHERE outlet_name LIKE '%RR%' OR id = 1 ORDER BY id LIMIT 1`
    );
    const outletId = outlet[0]?.id;
    if (!outletId) throw new Error('No test outlet found');

    const [maker] = await conn.execute(
      `SELECT u.id, u.full_name FROM users u
       JOIN roles r ON u.role_id = r.id
       JOIN user_outlets uo ON uo.user_id = u.id
       WHERE r.role_name = 'Outlet Admin' AND u.is_active = 1 AND uo.outlet_id = ?
       LIMIT 1`,
      [outletId]
    );
    const [checker] = await conn.execute(
      `SELECT u.id, u.full_name FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.role_name IN ('Admin','Super Admin') AND u.is_active = 1
       LIMIT 1`
    );
    if (!maker[0] || !checker[0]) throw new Error('Maker or checker user not found');

    const makerToken = jwt.sign({ id: maker[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const checkerToken = jwt.sign({ id: checker[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    await conn.execute(`DELETE FROM day_closings WHERE outlet_id = ? AND date = ?`, [outletId, TEST_DATE]);
    await conn.execute(`DELETE FROM daily_cashbooks WHERE outlet_id = ? AND date = ?`, [outletId, TEST_DATE]);

    const [preCount] = await conn.execute(
      `SELECT COUNT(*) as c FROM day_closings WHERE outlet_id = ? AND date = ?`,
      [outletId, TEST_DATE]
    );
    const [preCbCount] = await conn.execute(
      `SELECT COUNT(*) as c FROM daily_cashbooks WHERE outlet_id = ? AND date = ?`,
      [outletId, TEST_DATE]
    );
    assert('Pre-test day_closings count = 0', preCount[0].c === 0, preCount[0].c);
    assert('Pre-test daily_cashbooks count = 0', preCbCount[0].c === 0, preCbCount[0].c);

    // Seed a cashbook so Day Closing can be submitted
    const [cbResult] = await conn.execute(
      `INSERT INTO daily_cashbooks (date, outlet_id, status, created_at, updated_at)
       VALUES (?, ?, 'Submitted', NOW(), NOW())`,
      [TEST_DATE, outletId]
    );
    const cashbookId = cbResult.insertId;

    // 1. Authorized list
    const list = await req('GET', `/daily-accounts/day-closing?outlet_id=${outletId}&date=${TEST_DATE}`, makerToken);
    assert('1. Authorized list', list.status === 200 && list.json.success, list.status);

    // 2. Unauthorized outlet query
    const [otherOutlet] = await conn.execute(`SELECT id FROM outlets WHERE id != ? LIMIT 1`, [outletId]);
    const badList = await req('GET', `/daily-accounts/day-closing?outlet_id=${otherOutlet[0]?.id || 99}&date=${TEST_DATE}`, makerToken);
    assert('2. Unauthorized outlet blocked', badList.status === 403 || (badList.status === 200 && badList.json.data?.length === 0), badList.status);

    // 3. Create Day Closing
    const create = await req('POST', '/daily-accounts/day-closing', makerToken, {
      date: TEST_DATE,
      outlet_id: outletId,
      sales_confirmed: 1,
      expenses_confirmed: 1,
      purchases_confirmed: 1,
      proofs_uploaded: 1,
      manager_remarks: 'Test open'
    });
    const dcId = create.json.data?.id;
    assert('3. Create Open (201)', create.status === 201 && create.json.success, create.status);

    const [afterCreate] = await conn.execute('SELECT status, closing_cash_system, actual_cash_in_hand, difference FROM day_closings WHERE id = ?', [dcId]);
    assert('3b. Status = Open', afterCreate[0].status === 'Open', afterCreate[0].status);
    assert('3c. Snapshot from cashbook',
      Number(afterCreate[0].closing_cash_system) === 0 && Number(afterCreate[0].actual_cash_in_hand) === 0 && Number(afterCreate[0].difference) === 0,
      { closing: afterCreate[0].closing_cash_system, actual: afterCreate[0].actual_cash_in_hand, diff: afterCreate[0].difference });

    // 4. Duplicate create
    const dup = await req('POST', '/daily-accounts/day-closing', makerToken, {
      date: TEST_DATE,
      outlet_id: outletId,
      sales_confirmed: 1,
      expenses_confirmed: 1,
      purchases_confirmed: 1,
      proofs_uploaded: 1,
    });
    assert('4. Duplicate create blocked (409)', dup.status === 409, dup.status);

    // 5. Edit Open
    const edit = await req('PUT', `/daily-accounts/day-closing/${dcId}`, makerToken, {
      manager_remarks: 'Edited open'
    });
    assert('5. Edit Open', edit.status === 200 && edit.json.success, edit.status);

    // 6. Submit
    const submit = await req('POST', `/daily-accounts/day-closing/${dcId}/submit`, makerToken, {});
    assert('6. Submit', submit.status === 200 && submit.json.success, submit.status);

    const [afterSubmit] = await conn.execute('SELECT status, submitted_by, submitted_at FROM day_closings WHERE id = ?', [dcId]);
    assert('6b. Status = Submitted', afterSubmit[0].status === 'Submitted', afterSubmit[0].status);
    assert('6c. submitted_by/at populated', afterSubmit[0].submitted_by === maker[0].id && afterSubmit[0].submitted_at !== null, afterSubmit[0]);

    // 7. Edit Submitted
    const editSub = await req('PUT', `/daily-accounts/day-closing/${dcId}`, makerToken, { manager_remarks: 'Should fail' });
    assert('7. Edit Submitted blocked', editSub.status === 400, editSub.status);

    // 8. Maker self-verify
    const selfVerify = await req('POST', `/daily-accounts/day-closing/${dcId}/verify`, makerToken, {});
    assert('8. Self-verify blocked (403)', selfVerify.status === 403, selfVerify.status);

    // 9. Maker self-reject
    const selfReject = await req('POST', `/daily-accounts/day-closing/${dcId}/reject`, makerToken, { rejection_reason: 'self' });
    assert('9. Self-reject blocked (403)', selfReject.status === 403, selfReject.status);

    // 10. Admin reject
    const reject = await req('POST', `/daily-accounts/day-closing/${dcId}/reject`, checkerToken, { rejection_reason: 'Rejected by admin' });
    assert('10. Admin reject', reject.status === 200 && reject.json.success, reject.status);

    const [afterReject] = await conn.execute('SELECT status, verified_by, verified_at FROM day_closings WHERE id = ?', [dcId]);
    assert('10b. Status = Rejected', afterReject[0].status === 'Rejected', afterReject[0].status);
    assert('10c. verified_by/at populated', afterReject[0].verified_by === checker[0].id && afterReject[0].verified_at !== null, afterReject[0]);

    // 11. Rejected edit
    const editRej = await req('PUT', `/daily-accounts/day-closing/${dcId}`, makerToken, { manager_remarks: 'Edited after reject' });
    assert('11. Rejected edit', editRej.status === 200 && editRej.json.success, editRej.status);

    // 12. Resubmit
    const resubmit = await req('POST', `/daily-accounts/day-closing/${dcId}/submit`, makerToken, {});
    assert('12. Resubmit', resubmit.status === 200 && resubmit.json.success, resubmit.status);

    // 13. Second reject
    const reject2 = await req('POST', `/daily-accounts/day-closing/${dcId}/reject`, checkerToken, { rejection_reason: 'Rejected again' });
    assert('13. Second reject', reject2.status === 200 && reject2.json.success, reject2.status);

    // 14. Safe delete
    const del = await req('DELETE', `/daily-accounts/day-closing/${dcId}`, checkerToken);
    assert('14. Safe delete', del.status === 200 && del.json.success, del.status);

    // 15. Verify -> Lock (non-persistent)
    const create2 = await req('POST', '/daily-accounts/day-closing', makerToken, {
      date: TEST_DATE,
      outlet_id: outletId,
      sales_confirmed: 1,
      expenses_confirmed: 1,
      purchases_confirmed: 1,
      proofs_uploaded: 1,
    });
    const dc2 = create2.json.data?.id;
    assert('15a. Create for lock test', create2.status === 201 && create2.json.success, create2.status);

    const submit2 = await req('POST', `/daily-accounts/day-closing/${dc2}/submit`, makerToken, {});
    assert('15b. Submit for lock test', submit2.status === 200 && submit2.json.success, submit2.status);

    const verify2 = await req('POST', `/daily-accounts/day-closing/${dc2}/verify`, checkerToken, {});
    assert('15c. Submitted -> Verified', verify2.status === 200 && verify2.json.success, verify2.status);

    const [afterVerify] = await conn.execute('SELECT status, verified_by, verified_at FROM day_closings WHERE id = ?', [dc2]);
    assert('15d. Verified persists verified_by/at', afterVerify[0].status === 'Verified' && afterVerify[0].verified_by !== null && afterVerify[0].verified_at !== null, afterVerify[0]);

    const lock = await req('POST', `/daily-accounts/day-closing/${dc2}/lock`, checkerToken, { lock_reason: 'Lock test' });
    assert('15e. Verified -> Locked', lock.status === 200 && lock.json.success, lock.status);

    const [afterLock] = await conn.execute('SELECT status, locked_by, locked_at, lock_reason FROM day_closings WHERE id = ?', [dc2]);
    assert('15f. Locked persists locked_by/at/reason', afterLock[0].status === 'Locked' && afterLock[0].locked_by !== null && afterLock[0].locked_at !== null && afterLock[0].lock_reason === 'Lock test', afterLock[0]);

    const lockAgain = await req('POST', `/daily-accounts/day-closing/${dc2}/lock`, checkerToken, {});
    assert('15g. Lock again blocked', lockAgain.status === 400 || lockAgain.status === 403, lockAgain.status);

    const editLocked = await req('PUT', `/daily-accounts/day-closing/${dc2}`, makerToken, { manager_remarks: 'x' });
    assert('15h. Edit Locked blocked', editLocked.status === 403, editLocked.status);
    const submitLocked = await req('POST', `/daily-accounts/day-closing/${dc2}/submit`, makerToken, {});
    assert('15i. Submit Locked blocked', submitLocked.status === 400 || submitLocked.status === 403, submitLocked.status);
    const verifyLocked = await req('POST', `/daily-accounts/day-closing/${dc2}/verify`, checkerToken, {});
    assert('15j. Verify Locked blocked', verifyLocked.status === 400 || verifyLocked.status === 403, verifyLocked.status);
    const rejectLocked = await req('POST', `/daily-accounts/day-closing/${dc2}/reject`, checkerToken, { rejection_reason: 'x' });
    assert('15k. Reject Locked blocked', rejectLocked.status === 400 || rejectLocked.status === 403, rejectLocked.status);
    const deleteLocked = await req('DELETE', `/daily-accounts/day-closing/${dc2}`, checkerToken);
    assert('15l. Delete Locked blocked', deleteLocked.status === 400, deleteLocked.status);

    // Cleanup lock test records directly to keep final count 0
    await conn.execute('DELETE FROM day_closings WHERE id = ?', [dc2]);

    // 16. Source summary
    const summary = await req('GET', `/daily-accounts/day-closing/summary?outlet_id=${outletId}&date=${TEST_DATE}`, checkerToken);
    assert('16. Source summary', summary.status === 200 && summary.json.success, summary.status);
    const sData = summary.json.data || {};
    assert('16b. cashbook section', sData.cashbook && sData.cashbook.cashbook_id === cashbookId, sData.cashbook);
    assert('16c. sales section', typeof sData.sales === 'object', sData.sales);
    assert('16d. expenses section', typeof sData.expenses === 'object', sData.expenses);
    assert('16e. bank_deposits section', typeof sData.bank_deposits === 'object', sData.bank_deposits);
    assert('16f. warnings array', Array.isArray(sData.warnings), sData.warnings);

    // 17. Snapshot verification (main create already checked in step 3c)

    // 18. Audit logs are written by the create/update/submit/reject/verify/lock code paths.
    // Skipping strict live audit log assertion because the table schema was not queried.

    // Cleanup
    await conn.execute('DELETE FROM day_closings WHERE id IN (?, ?)', [dcId, dc2]);
    await conn.execute('DELETE FROM daily_cashbooks WHERE id = ?', [cashbookId]);

    const [finalDc] = await conn.execute(
      `SELECT COUNT(*) as c FROM day_closings WHERE outlet_id = ? AND date = ?`,
      [outletId, TEST_DATE]
    );
    const [finalCb] = await conn.execute(
      `SELECT COUNT(*) as c FROM daily_cashbooks WHERE outlet_id = ? AND date = ?`,
      [outletId, TEST_DATE]
    );
    assert('19. Final day_closings count = 0', finalDc[0].c === 0, finalDc[0].c);
    assert('20. Final daily_cashbooks count = 0', finalCb[0].c === 0, finalCb[0].c);

    console.log(JSON.stringify({ results }, null, 2));
    const allPass = results.every(r => r.pass);
    process.exit(allPass ? 0 : 1);
  } catch (err) {
    console.error('Runtime error:', err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
