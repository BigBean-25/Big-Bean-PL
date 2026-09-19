import {
  listControlledExceptions,
  getControlledExceptionById,
  createControlledException,
  submitControlledException,
  verifyControlledException,
  approveControlledException,
  rejectControlledException,
  executeControlledException,
  getControlledExceptionSupportMatrix,
} from '../services/controlledExceptionService.js';

const scopeAllows = (scope, row) => {
  if (!scope || scope.all) return true;
  const allowed = (scope.outletIds || []).map(Number);
  if (row?.outlet_id === null || row?.outlet_id === undefined) return false;
  return allowed.includes(Number(row.outlet_id));
};

const sendError = (res, error, fallback) => {
  console.error(`${fallback}:`, error);
  res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : fallback });
};

export const getExceptions = async (req, res) => {
  try {
    const rows = await listControlledExceptions({
      outletId: req.query.outlet_id || null,
      status: req.query.status || null,
      sourceModule: req.query.source_module || null,
      limit: req.query.limit || 200,
    });
    const scope = req.outletScope;
    const data = scope && !scope.all ? rows.filter((r) => scopeAllows(scope, r)) : rows;
    res.status(200).json({ success: true, data, support_matrix: getControlledExceptionSupportMatrix() });
  } catch (error) {
    sendError(res, error, 'Error listing controlled exceptions');
  }
};

export const getExceptionById = async (req, res) => {
  try {
    const row = await getControlledExceptionById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Exception not found' });
    if (!scopeAllows(req.outletScope, row)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this exception' });
    }
    res.status(200).json({ success: true, data: row, support_matrix: getControlledExceptionSupportMatrix() });
  } catch (error) {
    sendError(res, error, 'Error loading controlled exception');
  }
};

export const createException = async (req, res) => {
  try {
    const data = await createControlledException({
      sourceModule: req.body.source_module,
      sourceType: req.body.source_type,
      sourceId: req.body.source_id,
      sourceItemId: req.body.source_item_id ?? null,
      outletId: req.body.outlet_id ?? null,
      locationId: req.body.location_id ?? null,
      exceptionType: req.body.exception_type,
      reason: req.body.reason,
      businessImpact: req.body.business_impact,
      requestedBy: req.user.id,
      outletScope: req.outletScope,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendError(res, error, 'Error creating controlled exception');
  }
};

export const submitException = async (req, res) => {
  try {
    const row = await getControlledExceptionById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Exception not found' });
    if (!scopeAllows(req.outletScope, row)) return res.status(403).json({ success: false, message: 'You do not have access to this exception' });
    const data = await submitControlledException(req.params.id, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error, 'Error submitting controlled exception');
  }
};

export const verifyException = async (req, res) => {
  try {
    const row = await getControlledExceptionById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Exception not found' });
    if (!scopeAllows(req.outletScope, row)) return res.status(403).json({ success: false, message: 'You do not have access to this exception' });
    const data = await verifyControlledException(req.params.id, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error, 'Error verifying controlled exception');
  }
};

export const approveException = async (req, res) => {
  try {
    const row = await getControlledExceptionById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Exception not found' });
    if (!scopeAllows(req.outletScope, row)) return res.status(403).json({ success: false, message: 'You do not have access to this exception' });
    const data = await approveControlledException(req.params.id, req.user.id);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error, 'Error approving controlled exception');
  }
};

export const rejectException = async (req, res) => {
  try {
    const row = await getControlledExceptionById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Exception not found' });
    if (!scopeAllows(req.outletScope, row)) return res.status(403).json({ success: false, message: 'You do not have access to this exception' });
    const data = await rejectControlledException(req.params.id, req.user.id, req.body.rejection_reason);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error, 'Error rejecting controlled exception');
  }
};

export const executeException = async (req, res) => {
  try {
    const row = await getControlledExceptionById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Exception not found' });
    if (!scopeAllows(req.outletScope, row)) return res.status(403).json({ success: false, message: 'You do not have access to this exception' });
    const data = await executeControlledException({
      exceptionId: req.params.id,
      executedBy: req.user.id,
      reversalEffectiveDate: req.body.reversal_effective_date || null,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendError(res, error, 'Error executing controlled exception');
  }
};
