import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

const router = Router();

const AI_CREDIT_COSTS: Record<string, number> = {
  'caption': 5,
  'hashtags': 3,
  'email': 10,
  'reply': 5,
  'image_prompt': 8,
  'blog': 25,
  'ad_copy': 12,
};

router.get('/credits', async (req: Request, res: Response) => {
  const { organizationId } = (req as any).user;
  const wallet = await prisma.creditWallet.findUnique({ where: { organizationId } });
  res.json({ success: true, data: wallet ?? { balance: 0 } });
});

router.post('/generate', async (req: Request, res: Response) => {
  const { organizationId } = (req as any).user;
  const { task, prompt, platform, tone = 'professional', language = 'en' } = req.body;

  if (!task || !prompt) return res.status(400).json({ success: false, error: 'task and prompt required' });

  const creditCost = AI_CREDIT_COSTS[task] ?? 10;
  const wallet = await prisma.creditWallet.findUnique({ where: { organizationId } });

  if (!wallet || wallet.balance < creditCost) {
    return res.status(402).json({ success: false, error: 'Insufficient AI credits', required: creditCost, balance: wallet?.balance ?? 0 });
  }

  // Deduct credits
  await prisma.creditWallet.update({
    where: { organizationId },
    data: { balance: { decrement: creditCost } },
  });

  // Generate demo content (replace with real LLM call)
  const outputs: Record<string, string> = {
    caption: `✨ ${prompt}\n\nExperience the difference today! 🚀 #${platform ?? 'social'} #marketing #growth`,
    hashtags: `#${prompt.split(' ').slice(0, 5).map((w: string) => w.toLowerCase()).join(' #')} #trending #viral #marketing`,
    email: `Subject: ${prompt}\n\nDear Customer,\n\n${prompt}\n\nBest regards,\nThe Team`,
    reply: `Thank you for reaching out! ${prompt} We'll get back to you shortly. 😊`,
    ad_copy: `🔥 ${prompt} | Limited time offer!\n\nDon't miss out — act now and transform your results today!`,
    blog: `# ${prompt}\n\nIn today's digital landscape, ${prompt.toLowerCase()} has become increasingly important...`,
    image_prompt: `Professional ${tone} photograph of ${prompt}, high quality, 4K, studio lighting, ${platform} optimized`,
  };

  const output = outputs[task] ?? `Generated content for: ${prompt}`;

  res.json({ success: true, data: { output, task, creditsUsed: creditCost, remainingCredits: wallet.balance - creditCost } });
});

router.get('/agents', async (req: Request, res: Response) => {
  const agents = [
    { id: 'caption-writer', name: 'Caption Writer', description: 'AI-powered social media captions', cost: 5, icon: '✍️' },
    { id: 'hashtag-gen', name: 'Hashtag Generator', description: 'Trending hashtag suggestions', cost: 3, icon: '#️⃣' },
    { id: 'email-writer', name: 'Email Composer', description: 'Professional email campaigns', cost: 10, icon: '📧' },
    { id: 'reply-agent', name: 'Inbox Reply Agent', description: 'Smart reply suggestions', cost: 5, icon: '💬' },
    { id: 'ad-copy', name: 'Ad Copy Generator', description: 'High-converting ad copy', cost: 12, icon: '📢' },
    { id: 'blog-writer', name: 'Blog Writer', description: 'SEO-optimized blog posts', cost: 25, icon: '📝' },
  ];
  res.json({ success: true, data: agents });
});

export default router;
