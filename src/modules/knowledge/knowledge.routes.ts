import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// KB CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

router.get('/categories', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const cats = await prisma.kbCategory.findMany({ where: { workspaceId }, include: { _count: { select: { articles: true } } }, orderBy: { order: 'asc' } });
  res.json({ success: true, data: cats });
});

router.post('/categories', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { name } = req.body;
  if (!name) { res.status(400).json({ success: false, error: 'Name required' }); return; }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  const cat = await prisma.kbCategory.create({ data: { workspaceId, name, slug } });
  res.status(201).json({ success: true, data: cat });
});

router.delete('/categories/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.kbCategory.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// KB ARTICLES
// ─────────────────────────────────────────────────────────────────────────────

router.get('/articles', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const categoryId = req.query.categoryId as string | undefined;
  const where: Record<string, unknown> = { workspaceId };
  if (categoryId) where.categoryId = categoryId;
  const articles = await prisma.kbArticle.findMany({ where, include: { category: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: articles });
});

router.get('/articles/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const article = await prisma.kbArticle.findFirst({ where: { id: req.params.id, workspaceId }, include: { category: true } });
  if (!article) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  // Increment views
  await prisma.kbArticle.update({ where: { id: article.id }, data: { views: { increment: 1 } } });
  res.json({ success: true, data: article });
});

router.post('/articles', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { title, content, categoryId, isPublic } = req.body;
  if (!title || !content) { res.status(400).json({ success: false, error: 'title and content are required' }); return; }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  const article = await prisma.kbArticle.create({ data: { workspaceId, title, slug, content, categoryId, isPublic: isPublic ?? true } });
  res.status(201).json({ success: true, data: article });
});

router.patch('/articles/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { title, content, categoryId, isPublic } = req.body;
  const article = await prisma.kbArticle.updateMany({ where: { id: req.params.id, workspaceId }, data: { title, content, categoryId, isPublic } });
  res.json({ success: true, data: article });
});

router.delete('/articles/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.kbArticle.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// POST /articles/:id/vote
router.post('/articles/:id/vote', async (req: Request, res: Response) => {
  const { helpful } = req.body; // true = helpful, false = not helpful
  const field = helpful ? { helpful: { increment: 1 } } : { notHelpful: { increment: 1 } };
  const article = await prisma.kbArticle.update({ where: { id: req.params.id }, data: field });
  res.json({ success: true, data: { helpful: article.helpful, notHelpful: article.notHelpful } });
});

// ─────────────────────────────────────────────────────────────────────────────
// SURVEYS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/surveys', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const surveys = await prisma.survey.findMany({ where: { workspaceId }, include: { _count: { select: { responses: true, questions: true } } }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: surveys });
});

router.post('/surveys', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { title, description, isPublic, questions } = req.body;
  if (!title) { res.status(400).json({ success: false, error: 'Title required' }); return; }
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

  const survey = await prisma.survey.create({
    data: {
      workspaceId,
      title,
      description,
      slug,
      isPublic: isPublic ?? false,
      questions: {
        create: (questions ?? []).map((q: { question: string; type?: string; options?: string[]; required?: boolean }, idx: number) => ({
          question: q.question,
          type: q.type ?? 'TEXT',
          options: q.options,
          order: idx,
          required: q.required ?? false,
        })),
      },
    },
    include: { questions: true },
  });
  res.status(201).json({ success: true, data: survey });
});

router.get('/surveys/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const survey = await prisma.survey.findFirst({ where: { id: req.params.id, workspaceId }, include: { questions: { orderBy: { order: 'asc' } }, _count: { select: { responses: true } } } });
  if (!survey) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  res.json({ success: true, data: survey });
});

router.delete('/surveys/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.survey.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// POST /surveys/:id/respond (public — no auth)
router.post('/surveys/:id/respond', async (req: Request, res: Response) => {
  const { answers, respondentEmail } = req.body;
  const survey = await prisma.survey.findUnique({ where: { id: req.params.id } });
  if (!survey || !survey.isPublic) { res.status(404).json({ success: false, error: 'Survey not found or not public' }); return; }

  const response = await prisma.surveyResponse.create({
    data: { surveyId: req.params.id, answers, respondentEmail, ipAddress: req.ip },
  });
  res.status(201).json({ success: true, data: response });
});

// GET /surveys/:id/responses
router.get('/surveys/:id/responses', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const survey = await prisma.survey.findFirst({ where: { id: req.params.id, workspaceId } });
  if (!survey) { res.status(404).json({ success: false, error: 'Not found' }); return; }
  const responses = await prisma.surveyResponse.findMany({ where: { surveyId: req.params.id }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: responses });
});

// ─────────────────────────────────────────────────────────────────────────────
// WEB-TO-LEAD FORMS
// ─────────────────────────────────────────────────────────────────────────────

router.get('/web-forms', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const forms = await prisma.crmWebForm.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: forms });
});

router.post('/web-forms', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const { name, fields, redirectUrl, thankYouMsg } = req.body;
  if (!name) { res.status(400).json({ success: false, error: 'Name required' }); return; }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
  const form = await prisma.crmWebForm.create({ data: { workspaceId, name, slug, fields: fields ?? [], redirectUrl, thankYouMsg } });
  res.status(201).json({ success: true, data: form });
});

// POST /web-forms/:slug/submit (public endpoint)
router.post('/web-forms/:slug/submit', async (req: Request, res: Response) => {
  const form = await prisma.crmWebForm.findFirst({ where: { slug: req.params.slug, isActive: true } });
  if (!form) { res.status(404).json({ success: false, error: 'Form not found' }); return; }

  const data = req.body;
  // Create lead from submission
  await prisma.lead.create({
    data: {
      workspaceId: form.workspaceId,
      name: data.name ?? data.firstName ?? 'Web Lead',
      email: data.email,
      phone: data.phone,
    },
  });

  await prisma.crmWebForm.update({ where: { id: form.id }, data: { submissions: { increment: 1 } } });

  if (form.redirectUrl) {
    res.redirect(form.redirectUrl);
  } else {
    res.json({ success: true, message: form.thankYouMsg ?? 'Thank you! We will be in touch.' });
  }
});

router.delete('/web-forms/:id', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  await prisma.crmWebForm.deleteMany({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

export default router;
