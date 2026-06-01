import { query } from '../config/database.js';

export const logAudit = async (userId, action, tableName, recordId, oldData = null, newData = null, remarks = null) => {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, remarks, ip_address, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        action,
        tableName,
        recordId,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        remarks,
        null
      ]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
};

export const logApproval = async (userId, recordType, recordId, action, remarks = null) => {
  try {
    await query(
      `INSERT INTO approval_logs (user_id, record_type, record_id, action, remarks, created_at) 
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, recordType, recordId, action, remarks]
    );
  } catch (error) {
    console.error('Approval log error:', error);
  }
};

export const logUploadError = async (uploadId, rowNumber, errorMessage, rowData) => {
  try {
    await query(
      `INSERT INTO upload_error_logs (upload_id, row_number, error_message, row_data, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [uploadId, rowNumber, errorMessage, JSON.stringify(rowData)]
    );
  } catch (error) {
    console.error('Upload error log error:', error);
  }
};
