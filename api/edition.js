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

CRITICAL — VARIETY ACROSS RUNS: This edition is generated many times per day, and each run MUST feel genuinely different, not the same five stories reworded. To achieve this:
- The user message will specify which news CATEGORIES to emphasize this run and may suggest specific search terms — follow that emphasis when choosing your single search query and when selecting stories.
- Deliberately AVOID the "obvious top 5" that every news aggregator leads with. When multiple qualifying stories exist, prefer different specific events, angles, regions, and beats than the single biggest global headlines.
- Actively ROTATE between big global headlines and smaller, local, regional, or offbeat stories. At least 2 of your 5 should be lesser-covered or human-interest / niche stories rather than the day's dominant headlines.
- Pick DIFFERENT specific events when multiple qualify — do not simply reword the same shooting, wildfire, or geopolitical story that a "typical top 5" would surface. Vary the jokes, verdict labels, and meter scores too.
- If you find yourself about to pick the single most-covered story of the day, ask whether a fresher, less-obvious qualifying story would serve the edition better — usually it will.

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

  // --- Per-run variety: rotate which categories get emphasized and suggest
  // varied search terms, so the model's single web search returns different
  // results on repeated clicks within the same day. ---
  const CATEGORIES = [
    { name: 'US news', terms: ['US news today', 'American politics today', 'US economy inflation today'] },
    { name: 'world news', terms: ['world news today', 'Europe news today', 'international headlines today'] },
    { name: 'business & economy', terms: ['business news today', 'economy inflation today', 'markets news today'] },
    { name: 'tech & science', terms: ['technology news today', 'science breakthrough today', 'AI news today'] },
    { name: 'culture & entertainment', terms: ['culture news today', 'entertainment news today', 'film music news today'] },
    { name: 'sports', terms: ['sports news today', 'sports headlines today', 'sports upset today'] },
    { name: 'weather & disasters', terms: ['extreme weather news today', 'natural disaster today', 'heat wave storm today'] },
    { name: 'offbeat & local', terms: ['offbeat news today', 'weird local news today', 'human interest news today'] },
    { name: 'health & lifestyle', terms: ['health news today', 'lifestyle news today', 'wellness news today'] },
    { name: 'Jewish & Israel news', terms: ['Jewish community news today', 'Israel news today', 'Jewish culture news today'] }
  ];

  function pick(arr, n) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  const emphasis = pick(CATEGORIES, 4);
  const emphasisNames = emphasis.map((c) => c.name).join(', ');
  const suggestedTerms = emphasis.map((c) => c.terms[Math.floor(Math.random() * c.terms.length)]).join('  |  ');
  const seed = Math.random().toString(36).slice(2, 8);

  const userMessage =
    `Produce today's edition JSON now. ONE search only, then output the JSON.\n\n` +
    `For THIS run, emphasize these news categories (weight them roughly in this order): ${emphasisNames}.\n` +
    `Suggested search angles you may draw from (pick or adapt one for your single search): ${suggestedTerms}.\n` +
    `Variety token (ignore its meaning, just let it push you toward a different-than-usual selection): ${seed}.\n` +
    `Remember: avoid the obvious top-5 headlines, and rotate in at least two lesser-covered/offbeat/local stories.`;

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
            content: userMessage
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

    // No caching: each click should produce a fresh edition.
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Unknown server error' });
  }
}
