# Is It Good For The Jews?

A daily, AI-rated, satirical newspaper. Each "edition" runs five of today's
real headlines through the Good-For-The-Jews-O-Meter (0 = oy vey, 100 = mazel
tov), in a Woody-Allen-meets-Mel-Brooks voice, with shareable cards for
Facebook, X, and Instagram.

## How it's built

- `index.html` — the entire frontend (newspaper styling, gauges, meme-style
  shareable images). Plain HTML/CSS/JS, no build step.
- `api/edition.js` — serverless function that holds your Anthropic API key
  (server-side, never exposed to the browser), runs one web search for
  today's news, and asks Claude to return the day's ratings as JSON.
- `api/rate.js` — serverless function for the "Submit Your Own" box: takes a
  reader-submitted headline, URL, or description, optionally searches for
  context, and returns a single rating in the same format as one story.

This split matters: your API key must never live in the frontend code, or
anyone who views source could copy and use it. The serverless functions are
the only things that talk to Anthropic.

## Sharing

There are no social share buttons. Instead, every story (and the overall
verdict) renders as a generated image — right-click → Save Image As (or
long-press → Save to Photos on mobile) gives you a real PNG with the
headline, gauge, verdict, commentary, and kicker baked in, ready to attach to
any post on any platform. This sidesteps the various platform restrictions on
pre-filling posts with both text and images from a webpage.

## "Submit Your Own"

Readers can paste a headline, a URL, or describe something that happened, and
get a one-off rating card. This calls `/api/rate`, which makes its own Claude
+ web search call — so it has the same per-use cost as the daily edition.
Consider adding a simple rate limit (e.g. by IP, using Vercel KV or similar)
if this gets real traffic, since unlike the daily edition there's no shared
caching — each submission is a fresh API call.

## Deploying (Vercel, free tier)

Vercel auto-detects a `/api` folder of serverless functions next to a static
site — no framework or build step required.

1. **Get an Anthropic API key**
   Go to [console.anthropic.com](https://console.anthropic.com), create an
   API key, and make sure billing is set up (web search + Claude calls do
   incur small per-use costs — see "Cost notes" below).

2. **Put this project in a GitHub repo**
   Create a new repo (e.g. `is-it-good-for-the-jews`) and push these files
   (`index.html`, `api/edition.js`, `package.json`, `.gitignore`,
   `.env.example`, this `README.md`).

3. **Import the repo into Vercel**
   - Go to [vercel.com](https://vercel.com), sign up/log in (GitHub login is
     easiest).
   - Click **Add New → Project**, select your repo, and click **Deploy**.
     No special build settings needed — leave everything as default.

4. **Add your API key as an environment variable**
   - In the Vercel project, go to **Settings → Environment Variables**.
   - Add a variable named `ANTHROPIC_API_KEY` with your key as the value.
     Apply it to Production (and Preview/Development if you want).
   - Go to **Deployments**, click the "..." menu on the latest deployment,
     and **Redeploy** so the function picks up the new variable.

5. **Visit your site**
   Vercel gives you a URL like `is-it-good-for-the-jews.vercel.app`. Open it,
   click "Stop the Presses," and you should get a real, AI-composed edition.

## Custom domain

In Vercel: **Settings → Domains** → add your domain and follow the DNS
instructions.

## Cost notes

Each "Stop the Presses" click and each "Submit Your Own" makes one Claude API
call with web search enabled — a small cost per use (typically a fraction of
a cent to a couple of cents, depending on search results size). The edition
endpoint sets a one-hour edge cache header, so repeat visits within that
window are free; the rate endpoint has no caching since each submission is
unique. If this gets real traffic, consider:
- Switching the daily edition to a scheduled job (e.g. a cron that runs once
  per morning and stores the result), so its cost is fixed per day rather
  than per visitor.
- Adding a simple rate limit to both `api/edition.js` and `api/rate.js`
  (e.g. by IP).

## Tuning the humor

All of the personality lives in `SYSTEM_PROMPT` at the top of
`api/edition.js`. Adjust the tone, the verdict-label examples, the number of
stories (currently 5), or the Yiddish-to-neurotic-comedy ratio there.

## Local development

```bash
npm install -g vercel
vercel dev
```

Create a `.env` file (copy `.env.example`) with your real key before running
`vercel dev`.
