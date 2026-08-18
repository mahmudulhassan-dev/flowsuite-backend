import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Create a new Biolink landing page
export async function createBiolink(req: Request, res: Response) {
  try {
    const { urlSlug, title, description, logoUrl, themeSettings } = req.body;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    if (!urlSlug) {
      return res.status(400).json({ success: false, error: 'URL slug is required' });
    }

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }

    // Check if slug is taken
    const existing = await prisma.biolinkPage.findUnique({
      where: { urlSlug: urlSlug.trim().toLowerCase() }
    });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Biolink URL slug is already taken' });
    }

    const biolink = await prisma.biolinkPage.create({
      data: {
        workspaceId,
        urlSlug: urlSlug.trim().toLowerCase(),
        title: title || null,
        description: description || null,
        logoUrl: logoUrl || null,
        themeSettings: themeSettings || {},
        isActive: true,
        viewsCount: 0
      }
    });

    res.status(201).json({ success: true, data: biolink });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// List all Biolink pages in the workspace
export async function listBiolinks(req: Request, res: Response) {
  try {
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }

    const biolinks = await prisma.biolinkPage.findMany({
      where: { workspaceId },
      include: {
        blocks: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: biolinks });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Update a Biolink page's branding/theme
export async function updateBiolink(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { title, description, logoUrl, themeSettings, isActive } = req.body;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const existing = await prisma.biolinkPage.findFirst({
      where: { id, workspaceId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Biolink page not found' });
    }

    const updated = await prisma.biolinkPage.update({
      where: { id },
      data: {
        title: title !== undefined ? title : existing.title,
        description: description !== undefined ? description : existing.description,
        logoUrl: logoUrl !== undefined ? logoUrl : existing.logoUrl,
        themeSettings: themeSettings !== undefined ? themeSettings : existing.themeSettings,
        isActive: isActive !== undefined ? isActive : existing.isActive
      }
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Delete a Biolink page
export async function deleteBiolink(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const existing = await prisma.biolinkPage.findFirst({
      where: { id, workspaceId }
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Biolink page not found' });
    }

    await prisma.biolinkPage.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Biolink deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Get public Biolink configuration for rendering
export async function getBiolinkBySlug(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    const biolink = await prisma.biolinkPage.findUnique({
      where: { urlSlug: slug.trim().toLowerCase(), isActive: true },
      include: {
        blocks: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    if (!biolink) {
      return res.status(404).json({ success: false, error: 'Biolink page not found' });
    }

    // Increment page views asynchronously
    prisma.biolinkPage.update({
      where: { id: biolink.id },
      data: { viewsCount: { increment: 1 } }
    }).catch(console.error);

    res.json({ success: true, data: biolink });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Add a block to a Biolink page
export async function createBiolinkBlock(req: Request, res: Response) {
  try {
    const { biolinkPageId, type, config, sortOrder } = req.body;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const page = await prisma.biolinkPage.findFirst({
      where: { id: biolinkPageId, workspaceId }
    });

    if (!page) {
      return res.status(404).json({ success: false, error: 'Biolink page not found' });
    }

    const block = await prisma.biolinkBlock.create({
      data: {
        biolinkPageId,
        type,
        config: config || {},
        sortOrder: sortOrder || 0
      }
    });

    res.status(201).json({ success: true, data: block });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Update a block configuration / order
export async function updateBiolinkBlock(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { config, sortOrder } = req.body;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const block = await prisma.biolinkBlock.findFirst({
      where: {
        id,
        biolinkPage: {
          workspaceId
        }
      }
    });

    if (!block) {
      return res.status(404).json({ success: false, error: 'Block not found' });
    }

    const updated = await prisma.biolinkBlock.update({
      where: { id },
      data: {
        config: config !== undefined ? config : block.config,
        sortOrder: sortOrder !== undefined ? sortOrder : block.sortOrder
      }
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Delete a block from a Biolink page
export async function deleteBiolinkBlock(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const block = await prisma.biolinkBlock.findFirst({
      where: {
        id,
        biolinkPage: {
          workspaceId
        }
      }
    });

    if (!block) {
      return res.status(404).json({ success: false, error: 'Block not found' });
    }

    await prisma.biolinkBlock.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Block deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
