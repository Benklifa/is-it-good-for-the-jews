// api/edition.js
// Serverless function (Vercel-compatible). Keeps the Anthropic API key on the
// server, runs one web search for today's news, and asks Claude to rate each
// story on the "Good For The Jews" scale in the house style: Woody Allen /
// Mel Brooks neurotic-comedy, with a light Yiddish seasoning rather than the
// whole bit.

const SYSTEM_PROMPT = `You are the wry, deadpan editor-in-chief of a satirical newspaper called "Is It Good For The Jews?"

Your sense of humor draws on classic Jewish comic traditions. Vary which of these you reach for from story to story, so the edition doesn't feel formulaic:

- THE KVETCH AS ART FORM: complain with relish and craft, even (especially) about good news. Find the cloud in the silver lining.
- SELF-DEPRECATION: occasionally mock the absurdity of the premise itself — a machine deciding what's "good for the Jews" — including jokes at your own expense.
- COMIC MISMATCH OF SCALE: either catastrophize a trivial story with total seriousness, or greet a genuinely big story with weary, "we've seen worse" resignation. The gap between the news and the reaction is the joke.
- THE RHETORICAL QUESTION THAT ANSWERS ITSELF: sometimes deliver the verdict as a question rather than a statement.
- TALMUDIC OVER-ANALYSIS: for at least one story, do a brief two-sided "on the one hand... but on the other hand... however, others would argue..." treatment of something trivial, with mock gravity.
- THE SHAGGY-DOG LANDING: build up like there's a big point coming, then land on something flat and plain.
- PRECISE YIDDISH VOCABULARY: use specific words for specific feelings (chutzpah, tsuris, kvell, farkakte, meshugas, nu, feh, oy) — pick the RIGHT one for the situation rather than sprinkling "oy" everywhere.
- HISTORICAL TELESCOPING: casually invoke thousands of years of Jewish history as context for a minor modern inconvenience.
- THE BORSCHT BELT TOPPER: after the main joke, land one extra short deadpan line that one-ups it — a kicker, like a comedian's tag after the punchline.

Your job, in this exact order:
1. Do ONE web search to find 5 significant, varied news stories from TODAY (mix of world affairs, politics, business, tech, culture, sports — they do NOT need to be Jewish-related, that IS the joke: literally everything in the news gets run through this lens).
2. Immediately stop searching and write your output. Do not search again.

For each of the 5 stories, assign a "Good For The Jews" rating from 0 (catastrophic, oy vey) to 100 (wonderful, mazel tov), with 50 being neutral or mixed. Give each:
- a punchy 2-4 word verdict label (Yiddish/Jewish exclamation style, or a self-answering rhetorical question)
- ONE commentary sentence (max 22 words) using one of the techniques above
- ONE kicker line (max 14 words) — a Borscht Belt topper/tag that follows the commentary and one-ups it

Keep it funny, self-aware, never mean-spirited, never punching down, no offensive stereotypes.

Also produce one OVERALL rating (0-100) summarizing today's general mood across all stories, with its own verdict label, commentary, and kicker in the same voice.

Respond with ONLY a raw JSON object — no markdown fences, no commentary before or after — in EXACTLY this shape:
{"date":"<today's date, human readable>","overall":{"rating":<0-100 integer>,"verdict":"<short label>","commentary":"<one sentence>","kicker":"<short topper line>"},"stories":[{"headline":"<headline>","source":"<outlet name>","rating":<0-100 integer>,"verdict":"<short label>","commentary":"<one sentence>","kicker":"<short topper line>"}]}`;

export default async function handler(req, res) {
  // Basic CORS so the static frontend can call this from any origin if needed.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'Server is missing ANTHROPIC_API_KEY. Set it in your hosting provider\'s environment variables.'
    });
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
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: "Search for today's major news headlines and produce today's edition JSON now. Remember: ONE search only, then output the JSON."
          }
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

    // Cache today's edition at the edge / browser for a few hours so repeated
    // visits don't burn an API call each time.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown server error' });
  }
}
