import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { PostStatus, PostType } from '@prisma/client';

const router = Router();

// Helper to map string status to PostStatus
const mapPostStatus = (status: string): PostStatus => {
  const norm = String(status).toUpperCase();
  if (norm === 'DRAFT') return PostStatus.DRAFT;
  if (norm === 'PENDING_APPROVAL') return PostStatus.PENDING_APPROVAL;
  if (norm === 'SCHEDULED') return PostStatus.SCHEDULED;
  if (norm === 'PUBLISHING') return PostStatus.PUBLISHING;
  if (norm === 'PUBLISHED') return PostStatus.PUBLISHED;
  if (norm === 'FAILED') return PostStatus.FAILED;
  return PostStatus.DRAFT;
};

// GET /api/v1/publisher/posts
router.get('/posts', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { status, from, to } = req.query;

  const where: Record<string, any> = { workspaceId };
  if (status) where['status'] = mapPostStatus(String(status));
  if (from || to) {
    where['scheduledAt'] = {
      ...(from && { gte: new Date(String(from)) }),
      ...(to && { lte: new Date(String(to)) }),
    };
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  });

  res.json({ success: true, data: posts });
});

// POST /api/v1/publisher/posts
router.post('/posts', async (req: Request, res: Response) => {
  const { workspaceId, userId } = (req as any).user;
  const { content, platform, scheduledAt, mediaUrls = [], postType = 'TEXT' } = req.body;

  if (!content || !platform) {
    return res.status(400).json({ success: false, error: 'content and platform required' });
  }

  const post = await prisma.post.create({
    data: {
      workspaceId,
      authorId: userId,
      content,
      mediaUrls: mediaUrls,
      postType: String(postType).toUpperCase() as PostType,
      targetPlatforms: [platform],
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT,
    },
  });

  res.status(201).json({ success: true, data: post });
});

// PATCH /api/v1/publisher/posts/:postId
router.patch('/posts/:postId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { content, scheduledAt, status, mediaUrls, postType, targetPlatforms } = req.body;

  const post = await prisma.post.update({
    where: { id: req.params['postId'], workspaceId },
    data: {
      ...(content && { content }),
      ...(scheduledAt !== undefined && { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }),
      ...(status && { status: mapPostStatus(status) }),
      ...(mediaUrls && { mediaUrls }),
      ...(postType && { postType: String(postType).toUpperCase() as PostType }),
      ...(targetPlatforms && { targetPlatforms }),
    },
  });

  res.json({ success: true, data: post });
});

// DELETE /api/v1/publisher/posts/:postId
router.delete('/posts/:postId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.post.delete({ where: { id: req.params['postId'], workspaceId } });
  res.json({ success: true });
});

// GET /api/v1/publisher/calendar
router.get('/calendar', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { year, month } = req.query;

  const from = new Date(Number(year), Number(month) - 1, 1);
  const to = new Date(Number(year), Number(month), 0, 23, 59, 59);

  const posts = await prisma.post.findMany({
    where: { workspaceId, scheduledAt: { gte: from, lte: to } },
    orderBy: { scheduledAt: 'asc' },
  });

  res.json({ success: true, data: posts });
});

export default router;
