import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma';

const router = Router();

// Configure Multer storage
const uploadDir = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1e9);
    const sanitizedName = file.originalname.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${uniqueSuffix}_${sanitizedName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max per file
});

// POST /api/v1/assets/upload
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { folderId } = req.body;
    const file = req.file;

    if (!file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    // Calculate current storage and retrieve workspace limit
    const [totalUsedResult, workspace] = await Promise.all([
      prisma.mediaAsset.aggregate({
        where: { workspaceId },
        _sum: { fileSize: true },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { storageLimitMb: true },
      }),
    ]);
    
    const totalUsed = totalUsedResult._sum.fileSize || 0;
    const limitBytes = (workspace?.storageLimitMb || 5120) * 1024 * 1024; // Default to 5 GB

    // Check quota
    if (totalUsed + file.size > limitBytes) {
      // Clean up uploaded file
      try {
        fs.unlinkSync(file.path);
      } catch {}
      res.status(400).json({ success: false, error: 'Storage quota exceeded' });
      return;
    }

    const type = file.mimetype.split('/')[0];
    const fileCategory = type === 'image' ? 'image' : type === 'video' ? 'video' : 'doc';

    const asset = await prisma.mediaAsset.create({
      data: {
        workspaceId,
        folderId: folderId && folderId !== 'root' ? folderId : null,
        fileName: file.originalname,
        fileUrl: `/uploads/${file.filename}`,
        fileType: fileCategory,
        fileSize: file.size,
        storageKey: file.filename,
        storageEngine: 'LOCAL',
        uploadedById: (req as any).user?.id || null,
      },
    });

    res.status(201).json({ success: true, data: asset });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/assets
router.get('/', async (req: Request, res: Response) => {
  try {
    const { workspaceId, role: userRole, id: userId } = (req as any).user;
    const { folderId, starredOnly } = req.query;

    const targetFolderId = folderId && folderId !== 'root' ? (folderId as string) : null;
    const isPrivileged = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(userRole);

    const whereClauseFolders: any = {
      workspaceId,
      parentId: targetFolderId,
    };

    const whereClauseAssets: any = {
      workspaceId,
    };

    if (starredOnly === 'true') {
      whereClauseAssets.starred = true;
    } else {
      whereClauseAssets.folderId = targetFolderId;
    }

    // Role-based visibility logic
    if (!isPrivileged && userId) {
      whereClauseFolders.OR = [
        { createdById: userId },
        { createdById: null } // Shared/system folders
      ];
      whereClauseAssets.OR = [
        { uploadedById: userId },
        { uploadedById: null } // Shared/system files
      ];
    }

    // Fetch folders in current directory
    const folders = await prisma.folder.findMany({
      where: whereClauseFolders,
      orderBy: { createdAt: 'desc' },
    });

    // Fetch assets in current directory
    const assets = await prisma.mediaAsset.findMany({
      where: whereClauseAssets,
      orderBy: { createdAt: 'desc' },
    });

    // Get storage usage stats and dynamic limit
    const [totalUsedResult, workspace] = await Promise.all([
      prisma.mediaAsset.aggregate({
        where: { workspaceId },
        _sum: { fileSize: true },
      }),
      prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { storageLimitMb: true },
      }),
    ]);
    
    const totalUsed = totalUsedResult._sum.fileSize || 0;
    const limitBytes = (workspace?.storageLimitMb || 5120) * 1024 * 1024;

    // Fetch user-by-user storage usage for workspace managers/admins
    let userStorageUsages: any[] = [];
    if (isPrivileged) {
      try {
        const usages = await prisma.mediaAsset.groupBy({
          by: ['uploadedById'],
          where: { workspaceId },
          _sum: { fileSize: true },
        });
        
        const users = await prisma.user.findMany({
          where: {
            workspaceMembers: {
              some: { workspaceId }
            }
          },
          select: { id: true, fullName: true, email: true }
        });

        userStorageUsages = users.map(u => {
          const usage = usages.find(us => us.uploadedById === u.id);
          return {
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            used: usage?._sum.fileSize || 0,
          };
        });
      } catch (err) {
        console.error('Failed to fetch individual usages:', err);
      }
    }

    res.json({
      success: true,
      data: {
        folders,
        assets,
        storage: {
          used: totalUsed,
          limit: limitBytes,
          users: userStorageUsages,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/folders
router.post('/folders', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { name, parentId } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Folder name is required' });
      return;
    }

    const folder = await prisma.folder.create({
      data: {
        workspaceId,
        name: name.trim(),
        parentId: parentId && parentId !== 'root' ? parentId : null,
        createdById: (req as any).user?.id || null,
      },
    });

    res.status(201).json({ success: true, data: folder });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/assets/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;

    // Check if deleting a file
    const asset = await prisma.mediaAsset.findFirst({
      where: { id, workspaceId },
    });

    if (asset) {
      try {
        const filePath = path.join(uploadDir, asset.storageKey);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error('File delete warning:', e);
      }

      await prisma.mediaAsset.delete({ where: { id } });
      res.json({ success: true, message: 'File deleted successfully' });
      return;
    }

    // Check if deleting a folder
    const folder = await prisma.folder.findFirst({
      where: { id, workspaceId },
    });

    if (folder) {
      // Cascading delete folder contents
      const filesInFolder = await prisma.mediaAsset.findMany({
        where: { folderId: id },
      });

      for (const f of filesInFolder) {
        try {
          const filePath = path.join(uploadDir, f.storageKey);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {}
      }

      await prisma.mediaAsset.deleteMany({ where: { folderId: id } });
      await prisma.folder.delete({ where: { id } });

      res.json({ success: true, message: 'Folder deleted successfully' });
      return;
    }

    res.status(404).json({ success: false, error: 'Item not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/edit-photo
router.post('/edit-photo', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id, base64Image, saveAsNew } = req.body;

    if (!id || !base64Image) {
      res.status(400).json({ success: false, error: 'File ID and base64Image data are required' });
      return;
    }

    const originalAsset = await prisma.mediaAsset.findFirst({
      where: { id, workspaceId },
    });

    if (!originalAsset) {
      res.status(404).json({ success: false, error: 'Original file not found' });
      return;
    }

    // Extract base64 image data
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const newSize = buffer.length;

    const baseName = originalAsset.fileName.substring(0, originalAsset.fileName.lastIndexOf('.')) || originalAsset.fileName;
    const newFilename = `${Date.now()}_edited_${baseName.replace(/\s+/g, '_')}.png`;
    const newFilePath = path.join(uploadDir, newFilename);

    if (saveAsNew) {
      // Calculate current storage and retrieve workspace limit
      const [totalUsedResult, workspace] = await Promise.all([
        prisma.mediaAsset.aggregate({
          where: { workspaceId },
          _sum: { fileSize: true },
        }),
        prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { storageLimitMb: true },
        }),
      ]);
      
      const totalUsed = totalUsedResult._sum.fileSize || 0;
      const limitBytes = (workspace?.storageLimitMb || 5120) * 1024 * 1024;

      // Check quota
      if (totalUsed + newSize > limitBytes) {
        res.status(400).json({ success: false, error: 'Storage quota exceeded' });
        return;
      }

      fs.writeFileSync(newFilePath, buffer);

      const newAsset = await prisma.mediaAsset.create({
        data: {
          workspaceId,
          folderId: originalAsset.folderId,
          fileName: `edited_${baseName}.png`,
          fileUrl: `/uploads/${newFilename}`,
          fileType: 'image',
          fileSize: newSize,
          storageKey: newFilename,
          storageEngine: 'LOCAL',
          uploadedById: (req as any).user?.id || null,
        },
      });

      res.status(201).json({ success: true, data: newAsset });
    } else {
      // Overwrite
      try {
        const oldFilePath = path.join(uploadDir, originalAsset.storageKey);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch {}

      fs.writeFileSync(newFilePath, buffer);

      const updatedAsset = await prisma.mediaAsset.update({
        where: { id },
        data: {
          fileSize: newSize,
          fileUrl: `/uploads/${newFilename}`,
          storageKey: newFilename,
          fileName: `edited_${baseName}.png`,
        },
      });

      res.json({ success: true, data: updatedAsset });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/:id/rename
router.post('/:id/rename', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ success: false, error: 'Name is required' });
      return;
    }

    // Try folder rename
    const folder = await prisma.folder.findFirst({ where: { id, workspaceId } });
    if (folder) {
      const updated = await prisma.folder.update({
        where: { id },
        data: { name: name.trim() },
      });
      res.json({ success: true, data: updated });
      return;
    }

    // Try asset rename
    const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId } });
    if (asset) {
      const updated = await prisma.mediaAsset.update({
        where: { id },
        data: { fileName: name.trim() },
      });
      res.json({ success: true, data: updated });
      return;
    }

    res.status(404).json({ success: false, error: 'Item not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/:id/toggle-star
router.post('/:id/toggle-star', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;

    const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId } });
    if (!asset) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const updated = await prisma.mediaAsset.update({
      where: { id },
      data: { starred: !asset.starred },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/:id/move
router.post('/:id/move', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;
    const { folderId } = req.body;

    const targetFolderId = folderId === 'root' || !folderId ? null : folderId;

    // Try moving folder
    const folder = await prisma.folder.findFirst({ where: { id, workspaceId } });
    if (folder) {
      const updated = await prisma.folder.update({
        where: { id },
        data: { parentId: targetFolderId },
      });
      res.json({ success: true, data: updated });
      return;
    }

    // Try moving asset
    const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId } });
    if (asset) {
      const updated = await prisma.mediaAsset.update({
        where: { id },
        data: { folderId: targetFolderId },
      });
      res.json({ success: true, data: updated });
      return;
    }

    res.status(404).json({ success: false, error: 'Item not found' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/:id/share
router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id } = req.params;

    const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId } });
    if (!asset) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    if (asset.shareSlug) {
      res.json({ success: true, slug: asset.shareSlug });
      return;
    }

    const shareSlug = Math.random().toString(36).substring(2, 12);
    await prisma.mediaAsset.update({
      where: { id },
      data: { shareSlug },
    });

    res.json({ success: true, slug: shareSlug });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/edit-spreadsheet
router.post('/edit-spreadsheet', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id, csvData } = req.body;

    if (!id || !Array.isArray(csvData)) {
      res.status(400).json({ success: false, error: 'File ID and csvData list are required' });
      return;
    }

    const asset = await prisma.mediaAsset.findFirst({ where: { id, workspaceId } });
    if (!asset) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    // Convert matrix rows back into CSV text
    const csvContent = csvData.map((row: string[]) => 
      row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const filePath = path.join(uploadDir, asset.storageKey);
    fs.writeFileSync(filePath, csvContent, 'utf-8');

    const newSize = fs.statSync(filePath).size;

    const updated = await prisma.mediaAsset.update({
      where: { id },
      data: { fileSize: newSize },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/assets/edit-video
router.post('/edit-video', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = (req as any).user;
    const { id, startTime, endTime, filter, saveAsNew } = req.body;

    if (!id) {
      res.status(400).json({ success: false, error: 'File ID is required' });
      return;
    }

    const originalAsset = await prisma.mediaAsset.findFirst({
      where: { id, workspaceId },
    });

    if (!originalAsset || originalAsset.fileType !== 'video') {
      res.status(404).json({ success: false, error: 'Original video not found' });
      return;
    }

    const inputPath = path.join(uploadDir, originalAsset.storageKey);
    const baseName = originalAsset.fileName.substring(0, originalAsset.fileName.lastIndexOf('.')) || originalAsset.fileName;
    const extension = originalAsset.fileName.substring(originalAsset.fileName.lastIndexOf('.')) || '.mp4';
    const newFilename = `${Date.now()}_edited_${baseName.replace(/\s+/g, '_')}${extension}`;
    const outputPath = path.join(uploadDir, newFilename);

    // Build FFmpeg command options
    const args: string[] = [];

    if (startTime !== undefined && startTime !== '') {
      args.push(`-ss ${startTime}`);
    }
    if (endTime !== undefined && endTime !== '') {
      args.push(`-to ${endTime}`);
    }

    args.push(`-i "${inputPath}"`);

    // Add filters
    if (filter === 'grayscale') {
      args.push('-vf format=gray');
    } else if (filter === 'sepia') {
      args.push('-vf "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"');
    } else if (filter === 'invert') {
      args.push('-vf lutrgb="r=negval:g=negval:b=negval"');
    }

    // Output settings
    args.push('-c:v libx264 -preset superfast -crf 22 -c:a aac -strict -2');
    args.push(`"${outputPath}"`);

    const ffmpegCmd = `ffmpeg -y ${args.join(' ')}`;
    
    const { exec } = require('child_process');
    exec(ffmpegCmd, async (error: any, stdout: any, stderr: any) => {
      if (error) {
        console.error('FFmpeg execution error:', error);
        console.error('FFmpeg stderr:', stderr);
        res.status(500).json({ success: false, error: 'Failed to process video via FFmpeg' });
        return;
      }

      if (!fs.existsSync(outputPath)) {
        res.status(500).json({ success: false, error: 'Output video file was not generated' });
        return;
      }

      const newSize = fs.statSync(outputPath).size;

      if (saveAsNew) {
        // Create new asset
        const newAsset = await prisma.mediaAsset.create({
          data: {
            workspaceId,
            folderId: originalAsset.folderId,
            fileName: `edited_${baseName}${extension}`,
            fileUrl: `/uploads/${newFilename}`,
            fileType: 'video',
            fileSize: newSize,
            storageKey: newFilename,
            storageEngine: 'LOCAL',
            uploadedById: (req as any).user?.id || null,
          },
        });
        res.status(201).json({ success: true, data: newAsset });
      } else {
        // Overwrite
        try {
          if (fs.existsSync(inputPath)) {
            fs.unlinkSync(inputPath);
          }
        } catch {}

        const updatedAsset = await prisma.mediaAsset.update({
          where: { id },
          data: {
            fileSize: newSize,
            fileUrl: `/uploads/${newFilename}`,
            storageKey: newFilename,
            fileName: `edited_${baseName}${extension}`,
          },
        });
        res.json({ success: true, data: updatedAsset });
      }
    });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
