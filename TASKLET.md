# TASKLET — full control guide

The repo is public, so you can read every file. To ACT (trigger runs, write,
commit) you need a GitHub token from the owner.

## 1. Token to request

Classic token, scopes `repo` + `workflow`:
https://github.com/settings/tokens/new?scopes=repo,workflow&description=tasklet

Paste it into your GitHub connection. Never write it into this repo.

## 2. Run the engine on demand

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Issamonge/leadforge/actions/workflows/daily.yml/dispatches \
  -d '{"ref":"main","inputs":{"send_cap":"10","daily_target":"60","cities":"auto","dry_run":"false"}}'
```

| input | range | meaning |
|---|---|---|
| send_cap | 0-25 | emails this run (new + follow-ups combined) |
| daily_target | 10-400 | leads to collect |
| cities | `auto` or `Dubai,London` | rotate 4 cities, or name them |
| dry_run | true/false | true = find leads, send nothing |

## 3. Read the result

```bash
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/Issamonge/leadforge/actions/runs?per_page=1

curl -L -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/Issamonge/leadforge/actions/jobs/<JOB_ID>/logs
```

## 4. Secrets you do NOT need

All 9 are already in GitHub Actions. Because the workflow runs inside GitHub,
you never hold the credentials. Only ask for them if you run the code in your
own sandbox.

## 5. Before changing anything

Read `AGENTS.md` — 9 guardrails, each one exists because breaking it caused
real damage.

## 6. The three things to add yourself

- Twilio — real phone calls (qualify inbound, warm-transfer to Issa)
- Cloud browser — WhatsApp click-to-chat at volume, LinkedIn, portals
- Meta / Google Ads — paid traffic when funded
