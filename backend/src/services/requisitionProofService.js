// Outlet Purchase Order proof attachments (Phase 7B3B).
// Rows live in the shared proof_attachments table keyed by
// record_type='stock_requisition'; physical files are written by the shared
// multer config (uploads/proofs, jpg/jpeg/png/webp/pdf, 10MB each).
// These functions are document-metadata only - no stock, transfer,
// accounting, or requisition-status effects.
import { query, getConnection } from '../config/database.js';
import { canAccessAllOutlets } from '../utils/roleAccess.js';
import { isOwnDocument } from '../utils/makerChecker.js';

export const REQUISITION_PROOF_RECORD_TYPE = 'stock_requisition';
export const MAX_REQUISITION_ATTACHMENTS = 10;

const fail = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

// Location-scope check shared by read and write paths - identical semantics
// to GET /requisitions/:id: the caller's own location set (ownLocationIds
// before the stock-read carve-out locationIds) must cover the document.
export const isRequisitionInScope = (requisition, scope) => {
  if (scope?.all) return true;
  const allowed = scope?.ownLocationIds || scope?.locationIds || [];
  return allowed.includes(Number(requisition.from_location_id))
    || allowed.includes(Number(requisition.to_location_id));
};

// Write-side authorization for add/delete proof: Draft-only for everyone,
// and non-all-outlet roles must be the document's maker. All-outlet roles
// keep their existing document access but gain no override - the Draft rule
// applies to them too. Pure so it is fixture-testable.
export const assertRequisitionProofEditable = (requisition, scope, user) => {
  if (!requisition) fail(404, 'Outlet Purchase Order not found');
  if (!isRequisitionInScope(requisition, scope)) {
    fail(403, 'You do not have access to this Outlet Purchase Order');
  }
  if (!canAccessAllOutlets(user?.role_name) && !isOwnDocument(requisition, user?.id)) {
    fail(403, 'You can only manage proofs on Outlet Purchase Orders you created');
  }
  if (requisition.status !== 'Draft') {
    fail(400, 'Proofs can only be changed while the Outlet Purchase Order is in Draft');
  }
};

// Pure cap check - exported so the fixture suite can exercise the exact
// rule the transaction enforces under the parent row lock.
export const assertAttachmentCapacity = (existingCount, incomingCount) => {
  if (Number(existingCount) + incomingCount > MAX_REQUISITION_ATTACHMENTS) {
    fail(400, `An Outlet Purchase Order can hold at most ${MAX_REQUISITION_ATTACHMENTS} proofs (currently ${existingCount})`);
  }
};

export const getRequisitionAttachments = async (requisitionId) =>
  query(
    `SELECT id, file_name, file_path, file_type, file_size, uploaded_by, created_at
     FROM proof_attachments
     WHERE record_type = ? AND record_id = ?
     ORDER BY id ASC`,
    [REQUISITION_PROOF_RECORD_TYPE, requisitionId]
  );

// fileRows: [{file_name, file_path, file_type, file_size}] built by the route
// from multer's req.files. The parent row is locked FOR UPDATE before the
// count check so two concurrent uploads cannot race the 10-attachment cap.
export const addRequisitionAttachments = async (requisitionId, fileRows, { scope, user }) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, status, created_by, from_location_id, to_location_id FROM stock_requisitions WHERE id = ? FOR UPDATE',
      [requisitionId]
    );
    assertRequisitionProofEditable(rows[0], scope, user);
    const [[{ cnt }]] = await connection.execute(
      'SELECT COUNT(*) AS cnt FROM proof_attachments WHERE record_type = ? AND record_id = ?',
      [REQUISITION_PROOF_RECORD_TYPE, requisitionId]
    );
    assertAttachmentCapacity(cnt, fileRows.length);
    for (const f of fileRows) {
      await connection.execute(
        `INSERT INTO proof_attachments (record_type, record_id, file_name, file_path, file_type, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [REQUISITION_PROOF_RECORD_TYPE, requisitionId, f.file_name, f.file_path, f.file_type || null, f.file_size || null, user.id]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getRequisitionAttachments(requisitionId);
};

// Deletes the row inside the same parent-locked transaction, then returns
// the stored path so the route can unlink the file AFTER commit - the path
// always comes from the DB row, never from the request.
export const deleteRequisitionAttachment = async (requisitionId, attachmentId, { scope, user }) => {
  const connection = await getConnection();
  let filePath = null;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      'SELECT id, status, created_by, from_location_id, to_location_id FROM stock_requisitions WHERE id = ? FOR UPDATE',
      [requisitionId]
    );
    assertRequisitionProofEditable(rows[0], scope, user);
    const [attRows] = await connection.execute(
      'SELECT id, file_path FROM proof_attachments WHERE id = ? AND record_type = ? AND record_id = ?',
      [attachmentId, REQUISITION_PROOF_RECORD_TYPE, requisitionId]
    );
    const attachment = attRows[0];
    if (!attachment) fail(404, 'Proof attachment not found');
    await connection.execute('DELETE FROM proof_attachments WHERE id = ?', [attachment.id]);
    filePath = attachment.file_path;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return filePath;
};
