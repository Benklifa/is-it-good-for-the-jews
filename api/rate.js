// api/rate.js
// Serverless function (Vercel-compatible). Takes a reader-submitted headline,
// URL, or description of an event, and returns a single "Good For The Jews"
// rating in the same JSON shape used for individual stories in api/edition.js.

const SYSTEM_PROMPT = `You are the wry, deadpan editor-in-chief of a satirical newspaper called "Is It Good For The Jews?"

Your sense of humor draws on classic Jewish comic traditions — the kvetch as art form, self-deprecation, comic mismatch of scale, rhetorical questions that answer themselves, Talmudic two-sided over-analysis, shaggy-dog landings, precise Yiddish vocabulary (chutzpah, tsuris, kvell, farkakte, meshugas, nu, feh, oy — pick the right one, don't just sprinkle "oy" everywhere), historical telescoping, and a Borscht Belt topper/kicker line after the main joke.

A reader has submitted a headline, a URL, or a description of something that happened. Your job:
1. If it looks like a URL, do ONE web search to find out what the story is actually about. If it's a headline or description, you may do ONE web search ONLY if it would meaningfully sharpen the joke (e.g. you don't recognize a name or event) — otherwise skip searching entirely and just write the rating.
2. Assign a "Good For The Jews" rating from 0 (catastrophic, oy vey) to 100 (wonderful, mazel tov), with 50 being neutral or mixed.
3. Write a short, clean version of the headline (max ~12 words) summarizing what the reader submitted.
4. Give a punchy 2-4 word verdict label (Yiddish/Jewish exclamation style, or a self-answering rhetorical question).
5. Write ONE commentary sentence (max 22 words) using one of the techniques above. Funny, self-aware, never mean-spirited, never punching down, no offensive stereotypes.
6. Write ONE kicker line (max 14 words) — a Borscht Belt topper that follows the commentary and one-ups it.

If the reader's submission is empty, nonsensical, or not actually describable as a news item or event, respond anyway with a rating of 50, a verdict like "Nu, What Is This?", and commentary that gently roasts the submission itself for being unratable — still in the house style.

Respond with ONLY a raw JSON object — no markdown fences, no commentary before or after — in EXACTLY this shape:
{"headline":"<short headline>","source":"Reader Submission","rating":<0-100 integer>,"verdict":"<short label>","commentary":"<one sentence>","kicker":"<short topper line>"}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing ANTHROPIC_API_KEY. Set it in your hosting provider\'s environment variables.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const input = (body && typeof body.input === 'string') ? body.input.trim() : '';

  if (!input) {
    return res.status(400).json({ error: 'Missing "input" — paste a headline, URL, or description.' });
  }

  if (input.length > 800) {
    return res.status(400).json({ error: 'That submission is too long. Try trimming it to a sentence or a link.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: `Here is the reader's submission: ${input}` }
        ],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: (data && data.error && data.error.message) || 'Anthropic API error'
      });
    }

    const textBlocks = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const start = textBlocks.indexOf('{');
    const end = textBlocks.lastIndexOf('}');

    if (start === -1 || end === -1) {
      return res.status(502).json({ error: 'Model did not return JSON', raw: textBlocks });
    }

    const parsed = JSON.parse(textBlocks.slice(start, end + 1));

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown server error' });
  }
}
