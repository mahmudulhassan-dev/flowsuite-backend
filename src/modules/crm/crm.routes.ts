import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';
import { LeadStage } from '@prisma/client';

const router = Router();

// Helper to map string stage to LeadStage enum safely
const mapLeadStage = (stage: string): LeadStage => {
  const normalized = String(stage).toUpperCase();
  if (normalized === 'NEW' || normalized === 'NEW_LEAD') return LeadStage.NEW_LEAD;
  if (normalized === 'PROSPECT') return LeadStage.PROSPECT;
  if (normalized === 'QUALIFIED') return LeadStage.QUALIFIED;
  if (normalized === 'CUSTOMER') return LeadStage.CUSTOMER;
  if (normalized === 'CHURNED') return LeadStage.CHURNED;
  return LeadStage.NEW_LEAD;
};

// -----------------------------------------------------------------------------
// 1. CONTACTS & LEADS (Existing Compatible Endpoints)
// -----------------------------------------------------------------------------

router.get('/contacts', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { search, tag } = req.query;
  const where: Record<string, any> = { workspaceId };
  if (search) {
    where['OR'] = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { email: { contains: String(search), mode: 'insensitive' } },
      { phone: { contains: String(search), mode: 'insensitive' } },
    ];
  }
  if (tag) where['tags'] = { has: String(tag) };

  const contacts = await prisma.contact.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ success: true, data: contacts });
});

router.post('/contacts', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, email, phone, tags = [], stage = 'NEW_LEAD', leadScore = 0 } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      name,
      email,
      phone,
      tags,
      stage: mapLeadStage(stage),
      leadScore: parseInt(leadScore) || 0,
    },
  });
  res.status(201).json({ success: true, data: contact });
});

router.delete('/contacts/:contactId', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.contact.delete({ where: { id: req.params['contactId'], workspaceId } });
  res.json({ success: true });
});

router.get('/leads', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const leads = await prisma.lead.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  res.json({ success: true, data: leads });
});

router.post('/leads', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, email, phone, stage = 'NEW_LEAD', score = 50, tags = [] } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  const lead = await prisma.lead.create({
    data: {
      workspaceId,
      name,
      email,
      phone,
      stage: mapLeadStage(stage),
      score: parseInt(score) || 50,
      tags,
    },
  });
  res.status(201).json({ success: true, data: lead });
});

router.get('/pipeline', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const stages = [
    LeadStage.NEW_LEAD,
    LeadStage.PROSPECT,
    LeadStage.QUALIFIED,
    LeadStage.CUSTOMER,
    LeadStage.CHURNED,
  ];

  const pipeline = await Promise.all(
    stages.map(async (stage) => {
      const count = await prisma.lead.count({ where: { workspaceId, stage } });
      const scoreSum = await prisma.lead.aggregate({
        where: { workspaceId, stage },
        _sum: { score: true },
      });
      return {
        stage,
        count,
        totalValue: scoreSum._sum.score ?? 0,
      };
    })
  );
  res.json({ success: true, data: pipeline });
});

// -----------------------------------------------------------------------------
// 2. CUSTOMERS & CONTACTS CRUD
// -----------------------------------------------------------------------------

router.get('/customers', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const customers = await prisma.crmCustomer.findMany({
    where: { workspaceId },
    include: { contacts: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: customers });
});

router.post('/customers', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { companyName, address, city, state, zipCode, country, phone, website, currency = 'USD', contactEmail, contactFirstName, contactLastName } = req.body;

  if (!companyName) {
    return res.status(400).json({ success: false, error: 'companyName is required' });
  }

  const customer = await prisma.$transaction(async (tx) => {
    const cust = await tx.crmCustomer.create({
      data: {
        workspaceId,
        companyName,
        address,
        city,
        state,
        zipCode,
        country,
        phone,
        website,
        currency,
      },
    });

    if (contactEmail && contactFirstName) {
      await tx.crmCustomerContact.create({
        data: {
          customerId: cust.id,
          firstName: contactFirstName,
          lastName: contactLastName || '',
          email: contactEmail,
          password: 'Password123!', // Default access code
        },
      });
    }

    return tx.crmCustomer.findUnique({
      where: { id: cust.id },
      include: { contacts: true },
    });
  });

  res.status(201).json({ success: true, data: customer });
});

router.delete('/customers/:id', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.crmCustomer.delete({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 3. INVOICES CRUD & PAYMENTS
// -----------------------------------------------------------------------------

router.get('/invoices', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const invoices = await prisma.crmInvoice.findMany({
    where: { workspaceId },
    include: { customer: true, items: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: invoices });
});

router.post('/invoices', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { customerId, invoiceNumber, issueDate, dueDate, currency = 'USD', isRecurring = false, recurringPeriod, items = [] } = req.body;

  if (!customerId || !invoiceNumber || items.length === 0) {
    return res.status(400).json({ success: false, error: 'customerId, invoiceNumber, and items are required' });
  }

  // Calculate totals
  let subtotal = 0;
  let taxTotal = 0;
  
  const formattedItems = items.map((item: any) => {
    const qty = parseFloat(item.quantity) || 1;
    const rate = parseFloat(item.rate) || 0;
    const tax = parseFloat(item.taxPercent) || 0;
    const itemTotal = qty * rate;
    const itemTax = itemTotal * (tax / 100);
    
    subtotal += itemTotal;
    taxTotal += itemTax;
    
    return {
      description: item.description || 'Item',
      quantity: qty,
      rate,
      taxPercent: tax,
      total: itemTotal + itemTax
    };
  });

  const invoice = await prisma.crmInvoice.create({
    data: {
      workspaceId,
      customerId,
      invoiceNumber,
      status: 'UNPAID',
      issueDate: new Date(issueDate || Date.now()),
      dueDate: new Date(dueDate || Date.now()),
      currency,
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
      isRecurring,
      recurringPeriod,
      items: {
        create: formattedItems
      }
    },
    include: {
      customer: true,
      items: true
    }
  });

  res.status(201).json({ success: true, data: invoice });
});

router.post('/invoices/:id/pay', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const invoice = await prisma.crmInvoice.update({
    where: { id: req.params.id, workspaceId },
    data: { status: 'PAID' },
    include: { customer: true }
  });
  res.json({ success: true, message: 'Invoice marked as paid successfully', data: invoice });
});

router.delete('/invoices/:id', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  await prisma.crmInvoice.delete({ where: { id: req.params.id, workspaceId } });
  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 4. ESTIMATES & PROPOSALS
// -----------------------------------------------------------------------------

router.get('/estimates', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const estimates = await prisma.crmEstimate.findMany({
    where: { workspaceId },
    include: { customer: true, items: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: estimates });
});

router.post('/estimates', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { customerId, estimateNumber, issueDate, expiryDate, items = [] } = req.body;

  if (!customerId || !estimateNumber || items.length === 0) {
    return res.status(400).json({ success: false, error: 'customerId, estimateNumber, and items are required' });
  }

  let subtotal = 0;
  let taxTotal = 0;

  const formattedItems = items.map((item: any) => {
    const qty = parseFloat(item.quantity) || 1;
    const rate = parseFloat(item.rate) || 0;
    const tax = parseFloat(item.taxPercent) || 0;
    const itemTotal = qty * rate;
    const itemTax = itemTotal * (tax / 100);

    subtotal += itemTotal;
    taxTotal += itemTax;

    return {
      description: item.description || 'Estimate Item',
      quantity: qty,
      rate,
      taxPercent: tax,
      total: itemTotal + itemTax
    };
  });

  const estimate = await prisma.crmEstimate.create({
    data: {
      workspaceId,
      customerId,
      estimateNumber,
      status: 'SENT',
      issueDate: new Date(issueDate || Date.now()),
      expiryDate: new Date(expiryDate || Date.now()),
      subtotal,
      taxTotal,
      total: subtotal + taxTotal,
      items: {
        create: formattedItems
      }
    },
    include: {
      customer: true,
      items: true
    }
  });

  res.status(201).json({ success: true, data: estimate });
});

router.post('/estimates/:id/convert', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  
  const estimate = await prisma.crmEstimate.findFirst({
    where: { id: req.params.id, workspaceId },
    include: { items: true }
  });

  if (!estimate) return res.status(404).json({ success: false, error: 'Estimate not found' });

  // Convert to Invoice
  const invoice = await prisma.$transaction(async (tx) => {
    // 1. Update estimate status
    await tx.crmEstimate.update({
      where: { id: estimate.id },
      data: { status: 'ACCEPTED' }
    });

    // 2. Create Invoice
    return tx.crmInvoice.create({
      data: {
        workspaceId,
        customerId: estimate.customerId,
        invoiceNumber: `INV-FROM-EST-${estimate.estimateNumber}`,
        status: 'UNPAID',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days due
        currency: 'USD',
        subtotal: estimate.subtotal,
        taxTotal: estimate.taxTotal,
        total: estimate.total,
        items: {
          create: estimate.items.map(item => ({
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            taxPercent: item.taxPercent,
            total: item.total
          }))
        }
      }
    });
  });

  res.json({ success: true, message: 'Estimate converted to Invoice successfully', data: invoice });
});

router.get('/proposals', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const proposals = await prisma.crmProposal.findMany({
    where: { workspaceId },
    include: { customer: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: proposals });
});

router.post('/proposals', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { customerId, subject, content, total = 0, expiryDate } = req.body;

  if (!subject || !content) {
    return res.status(400).json({ success: false, error: 'subject and content are required' });
  }

  const proposal = await prisma.crmProposal.create({
    data: {
      workspaceId,
      customerId,
      subject,
      content,
      total: parseFloat(total) || 0,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      status: 'SENT'
    }
  });

  res.status(201).json({ success: true, data: proposal });
});

// -----------------------------------------------------------------------------
// 5. PROJECTS & TASKS
// -----------------------------------------------------------------------------

router.get('/projects', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const projects = await prisma.crmProject.findMany({
    where: { workspaceId },
    include: {
      customer: true,
      milestones: { include: { tasks: true } },
      tasks: true
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: projects });
});

router.post('/projects', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { customerId, name, description, startDate, deadline } = req.body;

  if (!customerId || !name) {
    return res.status(400).json({ success: false, error: 'customerId and name are required' });
  }

  const project = await prisma.crmProject.create({
    data: {
      workspaceId,
      customerId,
      name,
      description,
      startDate: startDate ? new Date(startDate) : null,
      deadline: deadline ? new Date(deadline) : null,
      status: 'IN_PROGRESS'
    }
  });

  res.status(201).json({ success: true, data: project });
});

router.post('/projects/:id/milestones', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, description } = req.body;

  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  // Verify project belongs to workspace
  const project = await prisma.crmProject.findFirst({
    where: { id: req.params.id, workspaceId }
  });
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

  const milestone = await prisma.crmProjectMilestone.create({
    data: {
      projectId: project.id,
      name,
      description
    }
  });

  res.status(201).json({ success: true, data: milestone });
});

router.post('/projects/:id/tasks', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { name, description, milestoneId, status = 'TODO', priority = 'MEDIUM', dueDate } = req.body;

  if (!name) return res.status(400).json({ success: false, error: 'name required' });

  const project = await prisma.crmProject.findFirst({
    where: { id: req.params.id, workspaceId }
  });
  if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

  const task = await prisma.crmProjectTask.create({
    data: {
      projectId: project.id,
      milestoneId,
      name,
      description,
      status,
      priority,
      dueDate: dueDate ? new Date(dueDate) : null
    }
  });

  res.status(201).json({ success: true, data: task });
});

// -----------------------------------------------------------------------------
// 6. CONTRACTS CRUD
// -----------------------------------------------------------------------------

router.get('/contracts', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const contracts = await prisma.crmContract.findMany({
    where: { workspaceId },
    include: { customer: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: contracts });
});

router.post('/contracts', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { customerId, subject, contractValue = 0, startDate, endDate, content } = req.body;

  if (!customerId || !subject || !startDate || !content) {
    return res.status(400).json({ success: false, error: 'customerId, subject, startDate, and content are required' });
  }

  const contract = await prisma.crmContract.create({
    data: {
      workspaceId,
      customerId,
      subject,
      contractValue: parseFloat(contractValue) || 0,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      content
    }
  });

  res.status(201).json({ success: true, data: contract });
});

// -----------------------------------------------------------------------------
// 7. SUPPORT TICKETS & DEPARTMENTS
// -----------------------------------------------------------------------------

router.get('/tickets', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const tickets = await prisma.crmTicket.findMany({
    where: { workspaceId },
    include: { replies: true },
    orderBy: { updatedAt: 'desc' }
  });
  res.json({ success: true, data: tickets });
});

router.post('/tickets', async (req: Request, res: Response) => {
  const { workspaceId } = (req as any).user;
  const { department = 'Support', subject, priority = 'MEDIUM', customerName, customerEmail, message } = req.body;

  if (!subject || !customerName || !customerEmail || !message) {
    return res.status(400).json({ success: false, error: 'subject, customerName, customerEmail, and message are required' });
  }

  const ticket = await prisma.$transaction(async (tx) => {
    const t = await tx.crmTicket.create({
      data: {
        workspaceId,
        department,
        subject,
        priority,
        status: 'OPEN',
        customerName,
        customerEmail
      }
    });

    await tx.crmTicketReply.create({
      data: {
        ticketId: t.id,
        senderName: customerName,
        senderEmail: customerEmail,
        message,
        isAdminReply: false
      }
    });

    return tx.crmTicket.findUnique({
      where: { id: t.id },
      include: { replies: true }
    });
  });

  res.status(201).json({ success: true, data: ticket });
});

router.post('/tickets/:id/replies', async (req: Request, res: Response) => {
  const { workspaceId, email, fullName } = (req as any).user;
  const { message } = req.body;

  if (!message) return res.status(400).json({ success: false, error: 'message required' });

  const ticket = await prisma.crmTicket.findFirst({
    where: { id: req.params.id, workspaceId }
  });
  if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

  const reply = await prisma.$transaction(async (tx) => {
    const r = await tx.crmTicketReply.create({
      data: {
        ticketId: ticket.id,
        senderName: fullName || 'Staff Agent',
        senderEmail: email,
        message,
        isAdminReply: true
      }
    });

    await tx.crmTicket.update({
      where: { id: ticket.id },
      data: { status: 'IN_PROGRESS', updatedAt: new Date() }
    });

    return r;
  });

  res.status(201).json({ success: true, data: reply });
});

export default router;
