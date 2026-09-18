# Lead Machine — AI Solutions Engine

An **autonomous lead engine + dashboard** for selling AI/automation services
(AI agents, n8n/Make workflows, dashboards, scraping, chatbots, web apps).

It finds buyers, scores them, drafts outreach, and emails you a daily digest —
**on completely free infrastructure**, so it keeps running when your AI credits
are exhausted and while you sleep.

---

## What it does, every day, automatically

| Stage | What happens |
|---|---|
| 1. Discover | Scrapes live buyer posts from free public sources (no API keys) |
| 2. Score | Ranks by service fit, budget, freshness, buyer intent; filters out competitors |
| 3. Draft | Writes a ready-to-send outreach email + subject for every qualified lead |
| 4. Publish | Rebuilds the dashboard (`index.html`) with the day's leads |
| 5. Digest | Optionally emails you the day's pipeline (free Resend key) |

**You only do the human-only parts:** log into Upwork/marketplaces to submit
proposals, take calls, negotiate, and close.

### Free data sources (no keys required)
- **n8n Community** jobs board (Discourse JSON API)
- **Make.com Community** (Discourse JSON API)
- **Hacker News** — "Ask HN: Who is hiring?" thread comments (Algolia API)
- **RemoteOK** public API
- **Remotive** public API

---

## Quick start

```bash
# 1. install nothing — it uses Node's built-in fetch (Node 18+)
node engine/run.mjs            # scan sources -> data/leads.json
node engine/build-dashboard.mjs # inject data into index.html
# or both:
npm run daily
```

Open `index.html` in a browser to see the dashboard.

### Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `DAILY_TARGET` | `30` | Max qualified leads per run |
| `MIN_BUDGET` | `0` | Drop leads below this listed budget |
| `PAYOUT_GOAL` | `500` | Monthly goal shown on the dashboard |
| `DIGEST_EMAIL` | – | Where the digest is sent |
| `PAYPAL_EMAIL` | – | Payment email included in outreach drafts |
| `RESEND_API_KEY` | – | Enables digest email (free tier: 3,000/mo) |
| `DIGEST_FROM` | `onboarding@resend.dev` | Verified sender for Resend |

---

## Deploy free — runs while you sleep

### Option A — GitHub (recommended, $0, truly autonomous)
1. Create a **new repository** and push this folder:
   ```bash
   git init && git add . && git commit -m "lead engine"
   gh repo create lead-engine --public --source=. --push
   ```
   (or create the repo on github.com and `git remote add origin … && git push -u origin main`)
2. Repo **Settings → Actions → General → Workflow permissions → Read and write**.
3. Repo **Settings → Secrets and variables → Actions**, add:
   `DIGEST_EMAIL`, `PAYPAL_EMAIL`, and optionally `RESEND_API_KEY` + `DIGEST_FROM`.
4. The workflow `.github/workflows/daily.yml` now runs daily at 07:00 UTC and
   commits fresh leads. Trigger a test run from the **Actions** tab → *Daily Lead Engine* → *Run workflow*.
5. Repo **Settings → Pages → Source: Deploy from branch → main / (root)**.
   Your dashboard is live at `https://<user>.github.io/lead-engine/`.

### Option B — Vercel / Cloudflare Pages (static hosting, $0)
- Import the repo on Vercel or Cloudflare Pages with **no build command** and
  output directory `.` (root). The dashboard is served; the GitHub Action keeps
  the data fresh. `vercel.json` is already included.

### Option C — Run it on your own machine
`npm run daily`, then open `index.html`. Add it to cron/Task Scheduler for
unattended runs.

---

## Dashboard features
- KPI cards: targets scanned, qualified leads, listed pipeline value, revenue booked
- **$ goal tracker** — log won deals (stored locally in your browser)
- Filter/search by source, status, keyword
- One-click **outreach draft** copy per lead
- Status pipeline: new → contacted → replied → won/lost
- **Export CSV** of everything

---

## Extending it
- **Add a source:** write a function in `engine/run.mjs` returning
  `{id, source, title, description, url, postedAt}` and add it to `SOURCES`.
- **Tune scoring:** edit `scoreLead()` and `SERVICE_KEYWORDS`.
- **Auto-send outreach:** wire an email provider into `run.mjs` (be careful —
  review drafts first, cold outreach must respect anti-spam law).

## Honest limitations
- Upwork and Reddit block server-side scraping. For Upwork's live feed you need
  a logged-in browser session — submit those proposals manually.
- Listed budgets are only captured when the post states one (community posts
  often don't).
- This tool finds work and writes the pitch. **It does not close deals** — calls,
  trust, and delivery stay with you.

---

# Voice layer — AI answers/calls customers, escalates to your WhatsApp

## What this does
A voice-AI agent (Vapi / Retell / Bland) answers or places calls, qualifies the
caller, and — when a human is needed — pushes an alert to **your WhatsApp**.

Three outcomes are detected automatically and trigger a WhatsApp message:

| Outcome | Trigger | Alert |
|---|---|---|
| `escalate_human` | caller asks for a human / deal > $1,500 / agent unsure | 🔴 ESCALATION — call back now |
| `not_interested` | "no thanks", "remove me", "stop calling" | 🟡 NOT INTERESTED — follow up personally |
| `hot` | interested, asks price, wants the link | 🟢 INTERESTED — send payment link |

## Files
- `voice/webhook.mjs` — provider-agnostic event handler + WhatsApp escalation (tested).
- `voice/assistant.json` — the assistant's system prompt, voice, and tools.
- `voice/create-assistant.mjs` — pushes the assistant to Vapi (`VAPI_API_KEY` required).

## Server route
`POST /api/voice/webhook` — point your provider's webhook here.
Expose it publicly with `cloudflared tunnel --url http://localhost:8080`.

## Going live (requires a provider account — this costs money)
1. Create an account at **vapi.ai** (or retellai.com / bland.ai).
2. Buy or import a phone number.
3. Get the API key and save it as `VAPI_API_KEY`.
4. `PUBLIC_WEBHOOK_URL=https://<your-tunnel> VAPI_API_KEY=... node voice/create-assistant.mjs`
5. Set the returned assistant id as the inbound/outbound agent on that number.

Typical cost: **$0.07–$0.15 per minute** of conversation, plus the number.

## Compliance (important if you place OUTBOUND calls)
Automated outbound calls are regulated — in the US under the TCPA, and similarly
in the EU and UAE. Only call numbers with prior consent, always disclose that the
caller is an AI assistant, and honor "remove me" immediately. Inbound-only is the
safe starting point.

---

# Email outreach — leads that publish a REAL address

## The problem this solves
Community-forum leads have **no email address** — you cannot email them. This
source fixes that by pulling businesses that **publish their own contact email**.

## Source: OpenStreetMap / Overpass API
Free, no API key, ODbL-licensed. Returns businesses that publish `email` or
`contact:email` — i.e. addresses they put online **for the purpose of being
contacted**. Typically 30–60 usable leads per city.

Configure markets with `TARGET_CITIES` (default `Dubai,London,New York`).
Built-in cities: Dubai, Abu Dhabi, London, New York, Los Angeles, Chicago,
Toronto, Sydney. Niches: dental, clinics, veterinary, real estate, law,
accounting, insurance, IT, automotive, furniture, jewellery, childcare,
language/driving schools and more.

## Sending (`engine/send.mjs`)
| Env | Default | Purpose |
|---|---|---|
| `SEND_OUTREACH` | `false` | Must be `true` to actually send |
| `RESEND_API_KEY` | – | Resend API key (free tier 100/day) |
| `DAILY_SEND_CAP` | `25` | Hard daily cap — protects sender reputation |
| `OUTREACH_FROM` | `onboarding@resend.dev` | Your verified sender |
| `REPLY_TO` | your email | Replies land with you |
| `SENDER_IDENTITY` | – | Appears in every email |
| `SENDER_ADDRESS` | `Dubai, United Arab Emirates` | Required by CAN-SPAM |

### Built-in safeguards
- Hard daily cap (25) — never blasts
- **Never emails the same address twice** (`data/contacted.json`)
- Opt-out list honoured (`data/optout.json`)
- Every email carries your identity, a physical line, and a one-click opt-out

### Before it will really send
Resend will only deliver to arbitrary addresses once you **verify a sending
domain** (Resend → Domains → add your domain → add the DNS records). Until then
Resend only lets you mail your own address. Providers such as Brevo allow
sender-only verification if you don't own a domain yet.

## Compliance — read before enabling
Cold B2B email is legal in most markets **only** if you: identify yourself,
use an accurate subject line, include a physical address, and honour opt-outs
immediately. In the EU/UK you need a legitimate-interest basis; in the UAE,
follow TDRA guidance. Keep volume low, never buy lists, and if someone says
"stop", stop. All of the above is built in — keep it that way.

---

# Sending without any third party — `engine/smtp.mjs`

A zero-dependency SMTP client. No Resend, no Brevo, no API keys — just an
SMTP server. This is "build your own sender".

**Fastest working setup today (no domain needed): your Gmail + an app password.**

1. Google Account → Security → turn on **2-Step Verification**.
2. Then Security → **App passwords** → create one named "Lead Machine".
3. Copy the 16-character password.

```bash
export SMTP_USER="ihakizimana11@gmail.com"
export SMTP_PASS="your-16-char-app-password"
export SMTP_FROM="Issa Hakizimana <ihakizimana11@gmail.com>"
export SEND_OUTREACH=true
node engine/run.mjs
```

Defaults: `smtp.gmail.com:465` (implicit TLS). Set `SMTP_PORT=587` for STARTTLS.
Use an **App Password**, never your normal Google password.

### Transport priority (auto-detected)
1. `SMTP_USER` + `SMTP_PASS` → your own SMTP
2. `RESEND_API_KEY` → Resend
3. `BREVO_API_KEY` → Brevo

## Google Maps as a lead source — the honest limitation
`engine/sources/places.mjs` uses Google Places. **Google Maps never returns
email addresses.** It returns name, website, phone, address — so this source is
paired with `engine/sources/webemail.mjs`, which visits each business's own
website and extracts the address they publish for contact.

That pairing also upgrades *every other* source: any lead with a website but no
email gets one automatically each run.

---

## First live send — confirmed working
Transport: **your own Gmail via SMTP** (`engine/smtp.mjs`). No third party, no domain.
```
SMTP_USER="ihakizimana11@gmail.com"
SMTP_PASS="<16-char app password>"
SMTP_FROM="Issa Hakizimana <ihakizimana11@gmail.com>"
REPLY_TO="ihakizimana11@gmail.com"
SENDER_IDENTITY="Issa Hakizimana — AI Automation Studio"
SENDER_ADDRESS="Dubai, United Arab Emirates"
SEND_OUTREACH=true
DAILY_SEND_CAP=25
```
Verified: 3 of 3 outreach emails delivered on the first live run.
Replies land in the same Gmail inbox (`REPLY_TO`).
