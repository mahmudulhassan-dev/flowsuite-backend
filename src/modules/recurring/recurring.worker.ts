import { PrismaClient } from '@prisma/client';
import { sendMail } from '../../lib/mailer';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING INVOICE PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

async function processRecurringInvoices(): Promise<void> {
  const now = new Date();
  const due = await prisma.recurringInvoice.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { customer: { select: { companyName: true, contacts: { select: { email: true }, take: 1 } } } },
  });

  for (const rec of due) {
    // Check max cycles
    if (rec.maxCycles !== null && rec.cycleCount >= rec.maxCycles) {
      await prisma.recurringInvoice.update({ where: { id: rec.id }, data: { isActive: false } });
      continue;
    }

    // Clone as new invoice
    const invoiceNumber = `${rec.invoicePrefix}-${Date.now()}`;
    await prisma.crmInvoice.create({
      data: {
        workspaceId: rec.workspaceId,
        customerId: rec.customerId,
        invoiceNumber,
        status: 'UNPAID',
        issueDate: now,
        dueDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // +30 days
        currency: rec.currency,
        subtotal: rec.subtotal,
        taxTotal: rec.taxTotal,
        total: rec.total,
        items: { create: [] }, // Items stored in rec.items JSON
      },
    });

    // Compute next run date
    const nextRunAt = computeNextRun(now, rec.period);

    await prisma.recurringInvoice.update({
      where: { id: rec.id },
      data: { cycleCount: { increment: 1 }, lastRunAt: now, nextRunAt },
    });

    // Notify customer contact
    const contactEmail = rec.customer.contacts[0]?.email;
    if (contactEmail) {
      await sendMail({
        to: contactEmail,
        subject: `📄 New Invoice ${invoiceNumber} from FlowSuite`,
        html: `<p>Dear ${rec.customer.companyName},</p><p>A new invoice <strong>${invoiceNumber}</strong> for <strong>${rec.currency} ${rec.total.toFixed(2)}</strong> has been generated.</p>`,
      });
    }

    console.log(`✅ Recurring invoice cloned: ${invoiceNumber} for ${rec.customer.companyName}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING EXPENSE PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

async function processRecurringExpenses(): Promise<void> {
  const now = new Date();
  const due = await prisma.recurringExpense.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
  });

  for (const rec of due) {
    await prisma.expense.create({
      data: {
        workspaceId: rec.workspaceId,
        name: rec.name,
        category: rec.category,
        amount: rec.amount,
        currency: rec.currency,
        date: now,
      },
    });

    const nextRunAt = computeNextRun(now, rec.period);
    await prisma.recurringExpense.update({
      where: { id: rec.id },
      data: { lastRunAt: now, nextRunAt },
    });

    console.log(`✅ Recurring expense created: ${rec.name} (${rec.currency} ${rec.amount})`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF REMINDER PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

async function processStaffReminders(): Promise<void> {
  const now = new Date();
  const reminders = await prisma.staffReminder.findMany({
    where: { isSent: false, remindAt: { lte: now } },
  });

  for (const reminder of reminders) {
    // Get user email
    const user = await prisma.user.findUnique({ where: { id: reminder.userId }, select: { email: true, fullName: true } });
    if (!user) continue;

    if (reminder.notifyEmail) {
      await sendMail({
        to: user.email,
        subject: `⏰ Reminder: ${reminder.message}`,
        html: `<p>Hi ${user.fullName},</p><p>This is your scheduled reminder:</p><p><strong>${reminder.message}</strong></p><p>FlowSuite Platform</p>`,
      });
    }

    await prisma.staffReminder.update({ where: { id: reminder.id }, data: { isSent: true } });
    console.log(`✅ Reminder sent to ${user.email}: ${reminder.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING TASK PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

async function processRecurringTasks(): Promise<void> {
  const now = new Date();
  const tasks = await prisma.staffTask.findMany({
    where: { isRecurring: true, nextRunAt: { lte: now } },
  });

  for (const task of tasks) {
    // Clone task
    await prisma.staffTask.create({
      data: {
        workspaceId: task.workspaceId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        assigneeIds: task.assigneeIds ?? undefined,
        linkedType: task.linkedType,
        linkedId: task.linkedId,
      },
    });

    const nextRunAt = computeNextRun(now, task.recurringPeriod ?? 'WEEKLY');
    await prisma.staffTask.update({ where: { id: task.id }, data: { nextRunAt } });
    console.log(`✅ Recurring task cloned: ${task.title}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY — Compute next run date from period
// ─────────────────────────────────────────────────────────────────────────────

function computeNextRun(from: Date, period: string): Date {
  const d = new Date(from);
  switch (period.toUpperCase()) {
    case 'DAILY':   d.setDate(d.getDate() + 1); break;
    case 'WEEKLY':  d.setDate(d.getDate() + 7); break;
    case 'MONTHLY': d.setMonth(d.getMonth() + 1); break;
    case 'YEARLY':  d.setFullYear(d.getFullYear() + 1); break;
    default:        d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// START RECURRING WORKER (60-second polling loop)
// ─────────────────────────────────────────────────────────────────────────────

export function startRecurringWorker(): void {
  console.log('🔄 Starting Recurring Jobs Worker (60s interval)...');
  setInterval(async () => {
    try {
      await Promise.all([
        processRecurringInvoices(),
        processRecurringExpenses(),
        processStaffReminders(),
        processRecurringTasks(),
      ]);
    } catch (err) {
      console.error('❌ Recurring worker error:', err);
    }
  }, 60 * 1000);
}
