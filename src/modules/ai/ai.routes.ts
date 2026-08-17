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

  // Generate content using NaraRouter API if configured
  let output = '';
  const apiKey = process.env.NARA_ROUTER_API_KEY;

  if (apiKey) {
    try {
      const systemPrompts: Record<string, string> = {
        caption: `You are an expert social media caption writer. Write a catchy, engaging caption in ${language} with appropriate emojis, based on the prompt. Keep the tone ${tone} and target platform ${platform ?? 'social media'}.`,
        hashtags: `You are a social media growth expert. Generate a space-separated list of 10-15 relevant, trending hashtags for the prompt.`,
        email: `You are a professional email campaign manager. Write a structured email campaign with a subject line and body copy in ${language}. Tone: ${tone}.`,
        reply: `You are a helpful, polite customer support agent. Write a quick reply response in ${language} based on the prompt.`,
        ad_copy: `You are a direct-response copywriter. Write high-converting ad copy with an attention-grabbing headline, benefit bullet points, and a strong call to action. Language: ${language}.`,
        blog: `Write an SEO-optimized blog post section in ${language} on the topic of the prompt. Use clean formatting and headings.`,
        image_prompt: `Generate a detailed stable diffusion or Midjourney image prompt based on the prompt. Describe subject, scene settings, style, tone (${tone}), lighting, and camera details.`,
      };

      const systemPrompt = systemPrompts[task] ?? `You are a helpful assistant. Generate content in ${language}.`;
      const model = process.env.NARA_ROUTER_MODEL || 'meta-llama/llama-3-8b-instruct';

      const response = await fetch('https://router.bynara.id/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
        }),
      });

      if (response.ok) {
        const data = await response.json() as any;
        output = data?.choices?.[0]?.message?.content || '';
      } else {
        console.error('NaraRouter API error response status:', response.status);
      }
    } catch (error) {
      console.error('Failed to contact NaraRouter API:', error);
    }
  }

  // Fallback to static mock outputs if NaraRouter is not configured or failed
  if (!output) {
    const outputs: Record<string, string> = {
      caption: `✨ ${prompt}\n\nExperience the difference today! 🚀 #${platform ?? 'social'} #marketing #growth`,
      hashtags: `#${prompt.split(' ').slice(0, 5).map((w: string) => w.toLowerCase()).join(' #')} #trending #viral #marketing`,
      email: `Subject: ${prompt}\n\nDear Customer,\n\n${prompt}\n\nBest regards,\nThe Team`,
      reply: `Thank you for reaching out! ${prompt} We'll get back to you shortly. 😊`,
      ad_copy: `🔥 ${prompt} | Limited time offer!\n\nDon't miss out — act now and transform your results today!`,
      blog: `# ${prompt}\n\nIn today's digital landscape, ${prompt.toLowerCase()} has become increasingly important...`,
      image_prompt: `Professional ${tone} photograph of ${prompt}, high quality, 4K, studio lighting, ${platform} optimized`,
    };
    output = outputs[task] ?? `Generated content for: ${prompt}`;
  }

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
