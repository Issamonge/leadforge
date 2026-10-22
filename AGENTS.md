# AGENTS.md — Operating manual for AI agents (Tasklet)

You are operating the **Lead Machine**: an autonomous B2B lead engine.
Owner: Issa Hakizimana — AI Automation Studio, Dubai.
Payment link: https://paypal.me/7900861

Read this file fully before taking any action.

---

## 1. HOW TO RUN IT (two ways — pick one)

### Option A — trigger GitHub Actions (RECOMMENDED)
The code already runs on GitHub with all 9 secrets configured. You do **not**
need to hold any credentials. Just trigger the workflow and read the logs.

```bash
# trigger a run
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Issamonge/leadforge/actions/workflows/daily.yml/dispatches \
  -d '{"ref":"main"}'

# check the latest run
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/Issamonge/leadforge/actions/runs?per_page=1

# read the log of a job
curl -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/Issamonge/leadforge/actions/jobs/<JOB_ID>/logs
```

Required token scope: **repo** + **workflow**.

### Option B — run the code yourself (in your own sandbox)
```bash
git clone https://github.com/Issamonge/leadforge.git
cd leadforge
node engine/run.mjs          # requires Node 18+ and the env vars in §3
node engine/build-dashboard.mjs
```

**If you choose Option B you must supply the secrets yourself** (§3). They are
NOT in this repo and must never be committed here.

---

## 2. THE SCHEDULE

Five runs per day, Dubai time (UTC+4):

| Dubai | UTC |
|---|---|
| 07:00 | 03:00 |
| 11:00 | 07:00 |
| 15:00 | 11:00 |
| 19:00 | 15:00 |
| 23:00 | 19:00 |

Cron: `0 3,7,11,15,19 * * *`

If you cannot use GitHub Actions, replicate this schedule with your own
scheduler and run `node engine/run.mjs` five times daily.

---

## 3. ENVIRONMENT VARIABLES (Option B only)

```
SEND_OUTREACH=true
DAILY_SEND_CAP=10
TARGET_CITIES=auto
CITY_BATCH=4
SMTP_USER=ihakizimana11@gmail.com
SMTP_PASS=<gmail app password — ask the owner>
SMTP_FROM=Issa Hakizimana <ihakizimana11@gmail.com>
REPLY_TO=ihakizimana11@gmail.com
SENDER_IDENTITY=Issa Hakizimana — AI Automation Studio
SENDER_ADDRESS=Dubai, United Arab Emirates
PAYMENT_LINK=https://paypal.me/7900861
PILOT_PRICE=350
WHATSAPP_PHONE=+971505852438
CALLMEBOT_API_KEY=<ask the owner>
GOOGLE_MAPS_API_KEY=<optional — Places API needs billing enabled>
```

**Never commit any of these values to the repository.**

---

## 4. GUARDRAILS — DO NOT REMOVE OR BYPASS

These exist because each one was broken once and caused real damage.

1. **Never email the same address twice.** Check `data/contacted.json` AND
   `data/outreach-log.json` before every send. Dedupe within the batch too.
2. **Never domain-block a freemail provider** (`gmail.com`, `yahoo.com`,
   `hotmail.com`, `outlook.com`, …). One spam-blocked Gmail user must not cut
   off every Gmail address on earth. The `FREEMAIL` set in `engine/bounce.mjs`
   enforces this — keep it.
3. **The daily cap is for the whole run**, covering new sends **and**
   follow-ups combined. Not each.
4. **Auto-pause when bounce rate > 8%** (`engine/health.mjs`). Losing the
   sending account is worse than skipping a day.
5. **Honour `data/optout.json`** — suppressed addresses. Never contact them.
6. **Every email must carry** the sender identity, a physical address line, and
   an opt-out line ("reply stop"). Non-negotiable in most jurisdictions.
7. **First touch contains NO links and NO prices.** Links and money amounts are
   the strongest spam triggers. The payment link goes in the reply, after the
   prospect engages.
8. **Business hours only** (`engine/clock.mjs`, 08:00–19:00 local). Never pitch
   a business in the middle of its night.
9. **Validate before sending** (`engine/validate.mjs`): syntax → placeholder
   blocklist → MX record lookup. Dead domains must never be emailed.

---

## 5. WHAT A RUN DOES

```
1. Discover     OSM (62 cities × 40 niches, rotating 4/run) + Google Places
2. Enrich       crawl each business website for its published email
3. Validate     syntax + placeholder + MX record
4. Score        service fit, budget, freshness, buyer intent
5. Dedupe       contacted + outreach-log + within-batch
6. Timezone     skip anyone whose local time is outside business hours
7. Send         up to DAILY_SEND_CAP via Gmail SMTP
8. Follow up    +3d / +7d / +14d for anyone who has not replied
9. Detect       IMAP scan for replies and bounces
10. Suppress    bounced addresses; auto-block spam-blocking domains
11. Alert       WhatsApp message with tap-to-chat links
12. Commit      data/ + index.html back to the repo
```

---

## 6. THE MONEY MODEL

| Stage | Monthly | Rate |
|---|---|---|
| Emails sent | 1,800 | — |
| Replies | 54 | 3% |
| Pilots sold | 13 | 25% |
| Pilot revenue | $4,550 | $350 each |
| Retainers | 4 | 30% of pilots |
| Retainer revenue | $10,000 | $2,500/mo |
| **Total** | **≈ $14,550/mo** | **≈ $485/day** |

---

## 7. WHAT YOU SHOULD ADD (things the engine cannot do)

| Capability | Tool | Why it matters |
|---|---|---|
| **Phone calls** | Twilio | Qualify inbound leads, warm-transfer to Issa |
| **WhatsApp automation** | Cloud browser | Send + read + answer from the playbook |
| **Ads** | Meta / Google Ads | The only way past ~100 leads/day |
| **Reply drafting** | Your LLM | Draft answers using `whatsapp-playbook.html` |

**WhatsApp warning:** bulk automated messaging violates WhatsApp's Business
Messaging Policy and gets the number banned. Use click-to-chat links, or the
official WhatsApp Business API with pre-approved templates. Never script bulk
sends from +971505852438.

**Calling warning:** automated outbound calls are regulated (TCPA in the US,
similar in the EU and UAE). Only call with consent, always disclose you are an
AI assistant, and honour "remove me" instantly. Inbound-only is the safe start.

---

## 8. WHERE THE OUTPUTS LIVE

| File | Contents |
|---|---|
| `data/leads.json` | today's qualified leads (with `waLink` tap-to-chat links) |
| `data/contacted.json` | every address ever emailed |
| `data/outreach-log.json` | follow-up state per lead (step, repliedAt) |
| `data/optout.json` | suppressed addresses |
| `data/domain-block.json` | domains that spam-block us |
| `data/health.json` | send/bounce window for the pause guard |
| `index.html` | self-contained dashboard |
| `data/alerts.json` | WhatsApp alert history |

---

## 9. HOW TO REPORT BACK TO THE OWNER

After every run, report exactly:

```
Run <timestamp UTC>
  cities batch   : <list>
  leads found    : N (M with email, K with mobile)
  bounces cleared: N suppressed, M domains blocked
  emails sent    : N / cap
  follow-ups     : N sent
  replies        : N new
  paused?        : yes/no (+ reason)
```

Alert Issa on WhatsApp the moment a reply arrives. That is the moment money is
made or lost.

---

## 10. CURRENT KNOWN ISSUES

- **Gmail deliverability:** cold email from a personal `@gmail.com` gets
  spam-blocked (~50% of failures were `550 High probability of spam`). The
  permanent fix is a domain with SPF/DKIM/DMARC (~$10/yr). Until then keep the
  cap at 10/run and lean on WhatsApp (10–20% reply vs email's 2–5%).
- **Google Places:** coded but blocked on billing/API restrictions.
- **A second system** ("New legal services buyer lead for…") sends from the
  same Gmail account, doubling volume and sharing reputation. Consider pausing it.

---

## 11. DEFINITION OF SUCCESS

- 5 runs/day completing without error
- 40–60 new qualified leads/day, 30–90% with mobile numbers
- 10 sends/run, bounce rate under 8%
- Follow-ups firing on schedule
- WhatsApp alert within minutes of any reply
- **First $350 pilot paid within 14 days**
