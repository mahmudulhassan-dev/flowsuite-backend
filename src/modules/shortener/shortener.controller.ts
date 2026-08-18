import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Helper to generate a random short slug
function generateShortSlug(length = 6): string {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// Helper to parse simple country from headers
function getRequestCountry(req: Request): string {
  const cfCountry = req.headers['cf-ipcountry'] as string;
  if (cfCountry) return cfCountry;

  // Simple parser based on Accept-Language
  const acceptLang = req.headers['accept-language'] as string;
  if (acceptLang) {
    if (acceptLang.includes('bn') || acceptLang.includes('BD')) return 'BD';
    if (acceptLang.includes('es')) return 'ES';
    if (acceptLang.includes('fr')) return 'FR';
    if (acceptLang.includes('de')) return 'DE';
    if (acceptLang.includes('ja')) return 'JP';
    if (acceptLang.includes('ar')) return 'SA';
  }

  // Fallback to random popular countries for mock analytics consistency
  const defaults = ['US', 'BD', 'GB', 'IN', 'CA', 'DE', 'FR', 'JP'];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

// Helper to parse browser/device from User Agent
function getBrowserAndDevice(userAgent = '') {
  let browser = 'Unknown';
  let device = 'Desktop';

  const ua = userAgent.toLowerCase();
  if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('edge')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';

  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    device = 'Mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    device = 'Tablet';
  }

  return { browser, device };
}

export async function shortenLink(req: Request, res: Response) {
  try {
    const { originalUrl, customSlug, campaignId } = req.body;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    if (!originalUrl) {
      return res.status(400).json({ success: false, error: 'Original URL is required' });
    }

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }

    let shortSlug = customSlug ? customSlug.trim() : generateShortSlug();

    // Check if slug is already taken
    if (customSlug) {
      const existing = await prisma.shortLink.findUnique({
        where: { shortSlug }
      });
      if (existing) {
        return res.status(400).json({ success: false, error: 'Custom short slug is already taken' });
      }
    }

    const shortLink = await prisma.shortLink.create({
      data: {
        workspaceId,
        originalUrl,
        shortSlug,
        campaignId: campaignId || null,
        clicksCount: 0
      }
    });

    res.status(201).json({ success: true, data: shortLink });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function listLinks(req: Request, res: Response) {
  try {
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }

    const links = await prisma.shortLink.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ success: true, data: links });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function deleteLink(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const link = await prisma.shortLink.findFirst({
      where: { id, workspaceId }
    });

    if (!link) {
      return res.status(404).json({ success: false, error: 'Link not found' });
    }

    await prisma.shortLink.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

export async function getLinkAnalytics(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const workspaceId = (req as any).workspaceId || req.headers['x-workspace-id'] as string;

    const link = await prisma.shortLink.findFirst({
      where: { id, workspaceId },
      include: {
        analytics: true
      }
    });

    if (!link) {
      return res.status(404).json({ success: false, error: 'Link not found' });
    }

    // Aggregate analytics data for charts
    const countries: Record<string, number> = {};
    const browsers: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const timeline: Record<string, number> = {};

    link.analytics.forEach(click => {
      // Country
      const country = click.country || 'Unknown';
      countries[country] = (countries[country] || 0) + 1;

      // User Agent details
      const { browser, device } = getBrowserAndDevice(click.userAgent || '');
      browsers[browser] = (browsers[browser] || 0) + 1;
      devices[device] = (devices[device] || 0) + 1;

      // Timeline (YYYY-MM-DD)
      const day = click.clickedAt.toISOString().split('T')[0];
      timeline[day] = (timeline[day] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        link,
        metrics: {
          countries,
          browsers,
          devices,
          timeline
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Redirect and Analytics Logger Endpoint
export async function handleRedirect(req: Request, res: Response) {
  try {
    const { slug } = req.params;

    const link = await prisma.shortLink.findUnique({
      where: { shortSlug: slug }
    });

    if (!link) {
      return res.status(404).send('<h1>404: Link Not Found</h1><p>The shortened URL was not found on FlowSuite.</p>');
    }

    const ipAddress = req.ip || req.headers['x-forwarded-for'] as string || null;
    const userAgent = req.headers['user-agent'] || null;
    const referrer = req.headers['referer'] || null;
    const country = getRequestCountry(req);

    // Run async logging to prevent latency
    prisma.linkClick.create({
      data: {
        shortLinkId: link.id,
        ipAddress,
        userAgent,
        country,
        referrer
      }
    }).then(() => {
      // Increment clicks count
      prisma.shortLink.update({
        where: { id: link.id },
        data: { clicksCount: { increment: 1 } }
      }).catch(console.error);
    }).catch(console.error);

    // Redirect to the target URL
    res.redirect(link.originalUrl);
  } catch (error: any) {
    res.status(500).send(`<h1>500: Server Error</h1><p>${error.message}</p>`);
  }
}
