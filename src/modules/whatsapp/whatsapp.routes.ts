import { Router, Request, Response } from 'express';
import { connectToWhatsApp, getSessionStatus, disconnectSession } from './baileys.service';

const router = Router();

// POST /api/v1/whatsapp/connect
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    await connectToWhatsApp(workspaceId);
    res.json({ success: true, message: 'Pairing session initialized' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/whatsapp/status
router.get('/status', (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const status = getSessionStatus(workspaceId);
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/whatsapp/disconnect
router.post('/disconnect', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    await disconnectSession(workspaceId);
    res.json({ success: true, message: 'WhatsApp session disconnected' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
