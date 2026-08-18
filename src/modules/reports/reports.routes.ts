import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// SALES REPORT
// ─────────────────────────────────────────────────────────────────────────────

router.get('/sales', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().setDate(1)); // 1st of month
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  const invoices = await prisma.crmInvoice.findMany({
    where: {
      workspaceId,
      issueDate: { gte: from, lte: to },
    },
    include: { customer: { select: { companyName: true } } },
    orderBy: { issueDate: 'asc' },
  });

  const totalRevenue = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.total, 0);
  const totalUnpaid = invoices.filter(i => i.status !== 'PAID').reduce((s, i) => s + i.total, 0);

  // Group by date for chart
  const byDate: Record<string, number> = {};
  for (const inv of invoices) {
    const key = inv.issueDate.toISOString().split('T')[0];
    if (!byDate[key]) byDate[key] = 0;
    if (inv.status === 'PAID') byDate[key] += inv.total;
  }

  res.json({
    success: true,
    data: {
      totalRevenue,
      totalUnpaid,
      invoiceCount: invoices.length,
      paidCount: invoices.filter(i => i.status === 'PAID').length,
      chartData: Object.entries(byDate).map(([date, amount]) => ({ date, amount })),
      invoices,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES REPORT
// ─────────────────────────────────────────────────────────────────────────────

router.get('/expenses', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().setDate(1));
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  const expenses = await prisma.expense.findMany({
    where: { workspaceId, date: { gte: from, lte: to } },
    include: { customer: { select: { companyName: true } } },
    orderBy: { date: 'asc' },
  });

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  // Group by category
  const byCategory: Record<string, number> = {};
  for (const exp of expenses) {
    const cat = exp.category ?? 'Other';
    if (!byCategory[cat]) byCategory[cat] = 0;
    byCategory[cat] += exp.amount;
  }

  res.json({
    success: true,
    data: {
      totalExpenses,
      expenseCount: expenses.length,
      byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
      expenses,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LEADS CONVERSION REPORT
// ─────────────────────────────────────────────────────────────────────────────

router.get('/leads', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().setDate(1));
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  const leads = await prisma.lead.findMany({
    where: { workspaceId, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: 'desc' },
  });

  const byStage: Record<string, number> = {};
  for (const lead of leads) {
    const stage = (lead.stage as string) ?? 'NEW';
    if (!byStage[stage]) byStage[stage] = 0;
    byStage[stage]++;
  }

  res.json({
    success: true,
    data: {
      totalLeads: leads.length,
      byStage: Object.entries(byStage).map(([stage, count]) => ({ stage, count })),
      leads: leads.slice(0, 100),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CAMPAIGN PERFORMANCE REPORT
// ─────────────────────────────────────────────────────────────────────────────

router.get('/campaigns', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().setDate(1));
  const to = req.query.to ? new Date(req.query.to as string) : new Date();

  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId, createdAt: { gte: from, lte: to } },
    include: {
      _count: { select: { events: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Get event breakdowns for each campaign
  const results = await Promise.all(
    campaigns.map(async (c) => {
      const [opens, clicks, bounces, unsubs] = await Promise.all([
        prisma.campaignEvent.count({ where: { campaignId: c.id, type: 'OPEN' } }),
        prisma.campaignEvent.count({ where: { campaignId: c.id, type: 'CLICK' } }),
        prisma.campaignEvent.count({ where: { campaignId: c.id, type: 'BOUNCE' } }),
        prisma.campaignEvent.count({ where: { campaignId: c.id, type: 'UNSUBSCRIBE' } }),
      ]);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        sentCount: c.sentCount,
        opens,
        clicks,
        bounces,
        unsubs,
        openRate: c.sentCount > 0 ? ((opens / c.sentCount) * 100).toFixed(1) : '0.0',
        ctr: opens > 0 ? ((clicks / opens) * 100).toFixed(1) : '0.0',
        createdAt: c.createdAt,
      };
    })
  );

  res.json({ success: true, data: results });
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

router.get('/summary', async (req: Request, res: Response) => {
  const workspaceId = req.user!.workspaceId;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalRevenue,
    totalExpenses,
    totalLeads,
    totalSubscribers,
    openTasks,
    activeCampaigns,
  ] = await Promise.all([
    prisma.crmInvoice.aggregate({ where: { workspaceId, status: 'PAID', issueDate: { gte: monthStart } }, _sum: { total: true } }),
    prisma.expense.aggregate({ where: { workspaceId, date: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.lead.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
    prisma.subscriber.count({ where: { list: { workspaceId }, status: 'SUBSCRIBED' } }),
    prisma.staffTask.count({ where: { workspaceId, status: { not: 'DONE' } } }),
    prisma.campaign.count({ where: { workspaceId, status: 'ACTIVE' as never } }),
  ]);

  res.json({
    success: true,
    data: {
      revenue: totalRevenue._sum.total ?? 0,
      expenses: totalExpenses._sum.amount ?? 0,
      profit: (totalRevenue._sum.total ?? 0) - (totalExpenses._sum.amount ?? 0),
      newLeads: totalLeads,
      totalSubscribers,
      openTasks,
      activeCampaigns,
    },
  });
});

export default router;
