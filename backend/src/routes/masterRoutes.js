import express from 'express';
import { protect } from '../middleware/auth.js';
import { checkPermission } from '../middleware/permissionMiddleware.js';
import { upload } from '../config/multer.js';
import {
  outletController,
  categoryController,
  supplierController,
  rawMaterialController,
  createRawMaterial,
  menuItemController,
  unitController,
  expenseHeadController,
  paymentModeController,
  onlinePlatformController,
  dineInPortalController,
  bulkUploadRawMaterials,
  downloadRawMaterialsTemplate,
  bulkUploadMenuItems,
  downloadMenuItemsTemplate
} from '../controllers/masterController.js';

const router = express.Router();

const createRoutes = (path, controller, moduleKey = 'masters') => {
  router.get(`/${path}`, protect, controller.getAll);
  router.get(`/${path}/:id`, protect, controller.getById);
  router.post(`/${path}`, protect, checkPermission(moduleKey, 'can_create'), controller.create);
  router.put(`/${path}/:id`, protect, checkPermission(moduleKey, 'can_edit'), controller.update);
  router.delete(`/${path}/:id`, protect, checkPermission(moduleKey, 'can_delete'), controller.delete);
};

createRoutes('outlets', outletController, 'outlets');
createRoutes('categories', categoryController, 'categories');
createRoutes('suppliers', supplierController, 'suppliers');
router.get('/raw-materials/bulk-upload/template', protect, checkPermission('raw_materials', 'can_upload'), downloadRawMaterialsTemplate);
router.post('/raw-materials/bulk-upload', protect, upload.single('file'), checkPermission('raw_materials', 'can_upload'), bulkUploadRawMaterials);
router.get('/raw-materials', protect, rawMaterialController.getAll);
router.get('/raw-materials/:id', protect, rawMaterialController.getById);
router.post('/raw-materials', protect, checkPermission('raw_materials', 'can_create'), createRawMaterial);
router.put('/raw-materials/:id', protect, checkPermission('raw_materials', 'can_edit'), rawMaterialController.update);
router.delete('/raw-materials/:id', protect, checkPermission('raw_materials', 'can_delete'), rawMaterialController.delete);

router.get('/menu-items/bulk-upload/template', protect, checkPermission('menu_items', 'can_upload'), downloadMenuItemsTemplate);
router.post('/menu-items/bulk-upload', protect, upload.single('file'), checkPermission('menu_items', 'can_upload'), bulkUploadMenuItems);
createRoutes('menu-items', menuItemController, 'menu_items');
createRoutes('units', unitController, 'masters');
createRoutes('expense-heads', expenseHeadController, 'masters');
createRoutes('payment-modes', paymentModeController, 'masters');
createRoutes('online-platforms', onlinePlatformController, 'masters');
createRoutes('dine-in-portals', dineInPortalController, 'masters');

export default router;
