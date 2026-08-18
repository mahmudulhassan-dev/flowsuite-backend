import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import {
  createQrCode,
  listQrCodes,
  deleteQrCode,
  incrementQrScan
} from './qr.controller';

const qrRouter = Router();

qrRouter.post('/', authenticate, createQrCode);
qrRouter.get('/', authenticate, listQrCodes);
qrRouter.delete('/:id', authenticate, deleteQrCode);
qrRouter.post('/:id/scan', incrementQrScan); // Public scan counter increment

export default qrRouter;
