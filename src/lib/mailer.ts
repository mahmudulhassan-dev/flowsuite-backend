import nodemailer from 'nodemailer';

// ─────────────────────────────────────────────────────────────────────────────
// System SMTP — Hostinger · noreply@amanaflow.com
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_SMTP = {
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,          // SSL on port 465
  auth: {
    user: 'noreply@amanaflow.com',
    pass: 'AmanamartMail@2026#1',
  },
};

const SENDER = '"FlowSuite Platform" <noreply@amanaflow.com>';

// Singleton transporter (lazy-created)
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: SYSTEM_SMTP.host,
      port: SYSTEM_SMTP.port,
      secure: SYSTEM_SMTP.secure,
      auth: SYSTEM_SMTP.auth,
      tls: {
        rejectUnauthorized: false,  // Hostinger shared SSL compatibility
      },
    });
  }
  return _transporter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core send function — used for all transactional mails
// ─────────────────────────────────────────────────────────────────────────────

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendMail(opts: MailOptions): Promise<boolean> {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: opts.from ?? SENDER,
      to: Array.isArray(opts.to) ? opts.to.join(', ') : opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    console.log(`✉️  Mail sent to ${opts.to} — MessageID: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error('❌ Mail send failed:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk send — for marketing campaign dispatching
// ─────────────────────────────────────────────────────────────────────────────

export async function sendBulkMail(
  recipients: string[],
  subject: string,
  html: string,
  customSmtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromEmail: string;
    fromName: string;
  }
): Promise<{ sent: number; failed: number }> {
  const transporter = customSmtp
    ? nodemailer.createTransport({
        host: customSmtp.host,
        port: customSmtp.port,
        secure: customSmtp.secure,
        auth: { user: customSmtp.user, pass: customSmtp.pass },
        tls: { rejectUnauthorized: false },
      })
    : getTransporter();

  const fromLabel = customSmtp
    ? `"${customSmtp.fromName}" <${customSmtp.fromEmail}>`
    : SENDER;

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: fromLabel,
        to: recipient,
        subject,
        html,
      });
      sent++;
    } catch (err) {
      console.error(`❌ Bulk mail failed for ${recipient}:`, err);
      failed++;
    }
  }

  console.log(`📊 Bulk mail complete — Sent: ${sent}, Failed: ${failed}`);
  return { sent, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactional Email Templates
// ─────────────────────────────────────────────────────────────────────────────

export function buildWelcomeEmail(fullName: string, email: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;border:1px solid #334155;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">⚡ FlowSuite</h1>
              <p style="margin:8px 0 0;color:#c4b5fd;font-size:14px;">Omnichannel AI Social Media Automation</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:22px;">Welcome aboard, ${fullName}! 🎉</h2>
              <p style="margin:0 0 16px;color:#94a3b8;font-size:15px;line-height:1.7;">Your FlowSuite account has been created successfully. You now have access to the full omnichannel social media automation suite.</p>
              <div style="background:#0f172a;border:1px solid #334155;border-radius:10px;padding:16px 20px;margin:24px 0;">
                <p style="margin:0;color:#94a3b8;font-size:13px;">Your login email:</p>
                <p style="margin:6px 0 0;color:#a855f7;font-size:16px;font-weight:700;">${email}</p>
              </div>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.7;">Here's what you can do with FlowSuite:</p>
              <ul style="margin:0 0 24px;padding:0 0 0 20px;color:#94a3b8;font-size:14px;line-height:2;">
                <li>📱 Post to all social platforms from one place</li>
                <li>📅 Schedule & automate content calendars</li>
                <li>📩 Unified inbox for all your messages</li>
                <li>🤖 AI-powered content generation</li>
                <li>📊 CRM, invoicing & project management</li>
                <li>📣 Bulk email & SMS marketing campaigns</li>
              </ul>
              <a href="https://suite.amanasuite.com/auth/login" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Open FlowSuite Dashboard →</a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #334155;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">You received this email because you registered at <a href="https://suite.amanasuite.com" style="color:#7c3aed;">suite.amanasuite.com</a>.<br>If this was not you, please ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPasswordResetEmail(fullName: string, resetToken: string): string {
  const resetLink = `https://suite.amanasuite.com/auth/reset-password?token=${resetToken}`;
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;border:1px solid #334155;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#dc2626,#7c3aed);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#fff;font-size:28px;font-weight:800;">⚡ FlowSuite</h1>
              <p style="margin:8px 0 0;color:#fca5a5;font-size:14px;">Password Reset Request</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#f1f5f9;font-size:22px;">Reset your password, ${fullName}</h2>
              <p style="margin:0 0 24px;color:#94a3b8;font-size:15px;line-height:1.7;">We received a password reset request for your FlowSuite account. Click the button below to set a new password. This link expires in <strong style="color:#f97316;">30 minutes</strong>.</p>
              <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#dc2626,#7c3aed);color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">Reset My Password →</a>
              <p style="margin:24px 0 0;color:#64748b;font-size:13px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #334155;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">FlowSuite · <a href="https://suite.amanasuite.com" style="color:#7c3aed;">suite.amanasuite.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildCampaignHtml(
  subject: string,
  body: string,
  campaignId: string,
  unsubscribeUrl = 'https://suite.amanasuite.com/unsubscribe'
): string {
  const trackingPixel = `https://flowsuite.amansuite.com/api/v1/marketing/tracking/open?campaignId=${campaignId}`;
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed,#2563eb);padding:24px 40px;">
              <h2 style="margin:0;color:#fff;font-size:20px;font-weight:800;">⚡ FlowSuite</h2>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;color:#334155;font-size:15px;line-height:1.8;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:11px;">You are receiving this email as part of our marketing campaigns.<br>
              <a href="${unsubscribeUrl}" style="color:#7c3aed;">Unsubscribe</a> · <a href="https://suite.amanasuite.com" style="color:#7c3aed;">FlowSuite</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  <!-- Open Tracking Pixel -->
  <img src="${trackingPixel}" width="1" height="1" alt="" style="display:none;" />
</body>
</html>`;
}
