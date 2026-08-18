import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIBER LISTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /lists
router.get('/lists', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const lists = await prisma.subscriberList.findMany({
    where: { workspaceId },
    include: { _count: { select: { subscribers: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: lists });
});

// POST /lists
router.post('/lists', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { name, description } = req.body;
  if (!name) { res.status(400).json({ success: false, error: 'Name is required' }); return; }
  const list = await prisma.subscriberList.create({ data: { workspaceId, name, description } });
  res.status(201).json({ success: true, data: list });
});

// DELETE /lists/:id
router.delete('/lists/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.subscriberList.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIBERS CRUD
// ─────────────────────────────────────────────────────────────────────────────

// GET /lists/:listId/subscribers
router.get('/lists/:listId/subscribers', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;
  const status = req.query.status as string | undefined;

  const list = await prisma.subscriberList.findFirst({ where: { id: req.params.listId, workspaceId } });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }

  const where: Record<string, unknown> = { listId: req.params.listId };
  if (status) where.status = status;

  const [subscribers, total] = await Promise.all([
    prisma.subscriber.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.subscriber.count({ where }),
  ]);
  res.json({ success: true, data: subscribers, total, page, pages: Math.ceil(total / limit) });
});

// POST /lists/:listId/subscribers
router.post('/lists/:listId/subscribers', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const list = await prisma.subscriberList.findFirst({ where: { id: req.params.listId, workspaceId } });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }

  const { email, firstName, lastName, phone, customFields } = req.body;
  if (!email) { res.status(400).json({ success: false, error: 'Email is required' }); return; }

  const existing = await prisma.subscriber.findUnique({ where: { listId_email: { listId: req.params.listId, email } } });
  if (existing) { res.status(400).json({ success: false, error: 'Subscriber already exists in this list' }); return; }

  const sub = await prisma.subscriber.create({
    data: {
      listId: req.params.listId,
      email,
      firstName,
      lastName,
      phone,
      ipAddress: req.ip,
      customFields,
    },
  });
  res.status(201).json({ success: true, data: sub });
});

// POST /lists/:listId/import — bulk CSV import
router.post('/lists/:listId/import', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const list = await prisma.subscriberList.findFirst({ where: { id: req.params.listId, workspaceId } });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }

  // Accepts: { rows: [{email, firstName, lastName, phone}] }
  const rows: Array<{ email: string; firstName?: string; lastName?: string; phone?: string }> = req.body.rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ success: false, error: 'rows[] array is required' });
    return;
  }

  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.email) { skipped++; continue; }
    try {
      await prisma.subscriber.upsert({
        where: { listId_email: { listId: req.params.listId, email: row.email } },
        create: { listId: req.params.listId, email: row.email, firstName: row.firstName, lastName: row.lastName, phone: row.phone },
        update: {},
      });
      imported++;
    } catch {
      skipped++;
    }
  }
  res.json({ success: true, data: { imported, skipped, total: rows.length } });
});

// PATCH /lists/:listId/subscribers/:id
router.patch('/lists/:listId/subscribers/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const list = await prisma.subscriberList.findFirst({ where: { id: req.params.listId, workspaceId } });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }
  const { firstName, lastName, phone, status, customFields } = req.body;
  const sub = await prisma.subscriber.update({
    where: { id: req.params.id },
    data: { firstName, lastName, phone, status, customFields },
  });
  res.json({ success: true, data: sub });
});

// DELETE /lists/:listId/subscribers/:id
router.delete('/lists/:listId/subscribers/:id', async (req: Request, res: Response) => {
  await prisma.subscriber.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC UNSUBSCRIBE (no auth required — consumers click from email)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/unsubscribe', async (req: Request, res: Response) => {
  const { email, listId } = req.query as { email?: string; listId?: string };
  if (!email || !listId) {
    res.status(400).send('<p>Invalid unsubscribe link.</p>');
    return;
  }
  await prisma.subscriber.updateMany({
    where: { listId, email },
    data: { status: 'UNSUBSCRIBED' },
  });
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px;">
      <h2>✅ Unsubscribed</h2>
      <p>Your email <strong>${email}</strong> has been removed from our mailing list.</p>
    </body></html>
  `);
});

// ─────────────────────────────────────────────────────────────────────────────
// SMS PROVIDERS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/sms-providers', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const providers = await prisma.smsProvider.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: providers });
});

router.post('/sms-providers', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { name, type, apiKey, apiSecret, fromNumber, baseUrl } = req.body;
  if (!name || !apiKey) { res.status(400).json({ success: false, error: 'name and apiKey are required' }); return; }
  const provider = await prisma.smsProvider.create({ data: { workspaceId, name, type: type ?? 'SSL_WIRELESS', apiKey, apiSecret, fromNumber, baseUrl } });
  res.status(201).json({ success: true, data: provider });
});

router.patch('/sms-providers/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { name, apiKey, apiSecret, fromNumber, baseUrl, isActive } = req.body;
  const provider = await prisma.smsProvider.updateMany({
    where: { id: req.params.id, workspaceId },
    data: { name, apiKey, apiSecret, fromNumber, baseUrl, isActive },
  });
  res.json({ success: true, data: provider });
});

router.delete('/sms-providers/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.smsProvider.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// STAFF TASKS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/tasks', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const tasks = await prisma.staffTask.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: tasks });
});

router.post('/tasks', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { title, description, priority, dueDate, assigneeIds, linkedType, linkedId } = req.body;
  if (!title) { res.status(400).json({ success: false, error: 'Title is required' }); return; }
  const task = await prisma.staffTask.create({ data: { workspaceId, title, description, priority, dueDate: dueDate ? new Date(dueDate) : undefined, assigneeIds, linkedType, linkedId } });
  res.status(201).json({ success: true, data: task });
});

router.patch('/tasks/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { title, status, priority, dueDate } = req.body;
  const task = await prisma.staffTask.updateMany({ where: { id: req.params.id, workspaceId }, data: { title, status, priority, dueDate: dueDate ? new Date(dueDate) : undefined } });
  res.json({ success: true, data: task });
});

router.delete('/tasks/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.staffTask.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITY LOG
// ─────────────────────────────────────────────────────────────────────────────

router.get('/activity', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const logs = await prisma.activityLog.findMany({
    where: { workspaceId },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: logs });
});

// ─────────────────────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/goals', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const goals = await prisma.crmGoal.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: goals });
});

router.post('/goals', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { title, type, targetValue, deadline, color } = req.body;
  if (!title || !targetValue) { res.status(400).json({ success: false, error: 'title and targetValue are required' }); return; }
  const goal = await prisma.crmGoal.create({ data: { workspaceId, title, type, targetValue: parseFloat(targetValue), deadline: deadline ? new Date(deadline) : undefined, color } });
  res.status(201).json({ success: true, data: goal });
});

router.patch('/goals/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { currentValue, title, targetValue } = req.body;
  const goal = await prisma.crmGoal.updateMany({ where: { id: req.params.id, workspaceId }, data: { currentValue: currentValue !== undefined ? parseFloat(currentValue) : undefined, title, targetValue: targetValue ? parseFloat(targetValue) : undefined } });
  res.json({ success: true, data: goal });
});

router.delete('/goals/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.crmGoal.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

router.get('/expenses', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const expenses = await prisma.expense.findMany({ where: { workspaceId }, include: { customer: { select: { companyName: true } } }, orderBy: { date: 'desc' } });
  res.json({ success: true, data: expenses });
});

router.post('/expenses', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { name, category, amount, currency, date, note, customerId, billable } = req.body;
  if (!name || !amount || !date) { res.status(400).json({ success: false, error: 'name, amount, date are required' }); return; }
  const expense = await prisma.expense.create({ data: { workspaceId, name, category, amount: parseFloat(amount), currency: currency ?? 'USD', date: new Date(date), note, customerId, billable: billable ?? false } });
  res.status(201).json({ success: true, data: expense });
});

router.delete('/expenses/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.expense.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY EVENTS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/events', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const events = await prisma.companyEvent.findMany({ where: { workspaceId }, orderBy: { startAt: 'asc' } });
  res.json({ success: true, data: events });
});

router.post('/events', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { title, description, startAt, endAt, color, location, isPublic } = req.body;
  if (!title || !startAt) { res.status(400).json({ success: false, error: 'title and startAt are required' }); return; }
  const event = await prisma.companyEvent.create({ data: { workspaceId, title, description, startAt: new Date(startAt), endAt: endAt ? new Date(endAt) : undefined, color, location, isPublic: isPublic ?? true } });
  res.status(201).json({ success: true, data: event });
});

router.delete('/events/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.companyEvent.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// NEWSFEED
// ─────────────────────────────────────────────────────────────────────────────

router.get('/newsfeed', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const posts = await prisma.newsfeedPost.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json({ success: true, data: posts });
});

router.post('/newsfeed', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { content, visibility, attachments } = req.body;
  if (!content) { res.status(400).json({ success: false, error: 'Content is required' }); return; }
  const post = await prisma.newsfeedPost.create({ data: { workspaceId, authorId: req.user!.id, content, visibility: visibility ?? 'ALL', attachments } });
  res.status(201).json({ success: true, data: post });
});

router.delete('/newsfeed/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.newsfeedPost.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

export default router;
