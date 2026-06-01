import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  outletController,
  categoryController,
  supplierController,
  rawMaterialController,
  menuItemController,
  unitController,
  expenseHeadController,
  paymentModeController,
  onlinePlatformController,
  dineInPortalController
} from '../controllers/masterController.js';

const router = express.Router();

const createRoutes = (path, controller) => {
  router.get(`/${path}`, protect, controller.getAll);
  router.get(`/${path}/:id`, protect, controller.getById);
  router.post(`/${path}`, protect, authorize('Super Admin', 'Admin', 'Developer'), controller.create);
  router.put(`/${path}/:id`, protect, authorize('Super Admin', 'Admin', 'Developer'), controller.update);
  router.delete(`/${path}/:id`, protect, authorize('Super Admin', 'Developer'), controller.delete);
};

createRoutes('outlets', outletController);
createRoutes('categories', categoryController);
createRoutes('suppliers', supplierController);
createRoutes('raw-materials', rawMaterialController);
createRoutes('menu-items', menuItemController);
createRoutes('units', unitController);
createRoutes('expense-heads', expenseHeadController);
createRoutes('payment-modes', paymentModeController);
createRoutes('online-platforms', onlinePlatformController);
createRoutes('dine-in-portals', dineInPortalController);

export default router;
