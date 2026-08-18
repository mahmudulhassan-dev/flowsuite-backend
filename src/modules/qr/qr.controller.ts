import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function createQrCode(req: Request, res: Response) {
  try {
    const { name, type, config, shortSlug } = req.body;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    if (!name || !type || !config) {
      return res.status(400).json({ success: false, error: 'Name, type, and config are required' });
    }

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }

    const qrCode = await prisma.qrCode.create({
      data: {
        workspaceId,
        name,
        type,
        config: config || {},
        shortSlug: shortSlug || null,
        scansCount: 0
      }
    });

    res.status(201).json({ success: true, data: qrCode });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function listQrCodes(req: Request, res: Response) {
  try {
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }

    const qrCodes = await prisma.qrCode.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: qrCodes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteQrCode(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const qr = await prisma.qrCode.findFirst({
      where: { id, workspaceId }
    });

    if (!qr) {
      return res.status(404).json({ success: false, error: 'QR Code not found' });
    }

    await prisma.qrCode.delete({
      where: { id }
    });

    res.json({ success: true, message: 'QR Code deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function incrementQrScan(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const qr = await prisma.qrCode.findUnique({
      where: { id }
    });

    if (!qr) {
      return res.status(404).json({ success: false, error: 'QR Code not found' });
    }

    const updated = await prisma.qrCode.update({
      where: { id },
      data: {
        scansCount: { increment: 1 }
      }
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
