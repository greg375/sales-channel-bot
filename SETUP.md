# Sales Channel Intelligence Bot — Setup Guide

Total time: ~10 minutes.

---

## Step 1 — Push to GitHub (2 min)

1. Go to https://github.com/new and create a new **private** repository called `sales-channel-bot`
2. On your computer, open a terminal in this folder and run:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/sales-channel-bot.git
git push -u origin main
```

---

## Step 2 — Deploy to Vercel (2 min)

1. Go to https://vercel.com and sign in (free account is fine)
2. Click **"Add New Project"**
3. Import the `sales-channel-bot` repo from GitHub
4. Click **Deploy** (no build settings needed — Vercel auto-detects serverless functions)
5. Once deployed, copy your URL — it will look like: `https://sales-channel-bot-abc123.vercel.app`

---

## Step 3 — Create your Slack App (3 min)

1. Go to https://api.slack.com/apps and click **"Create New App"**
2. Choose **"From an app manifest"**
3. Select your workspace
4. Paste the contents of `slack-app-manifest.yaml` (open the file and copy everything)
5. **IMPORTANT**: In the manifest, replace `REPLACE_WITH_YOUR_VERCEL_URL` with your actual Vercel URL from Step 2
   - Example: `url: https://sales-channel-bot-abc123.vercel.app/api/scan`
6. Click **Create**
7. On the next screen click **"Install to Workspace"** and allow the permissions

### Get your tokens:
- **Bot Token**: Go to **OAuth & Permissions** → copy the `xoxb-...` token
- **Signing Secret**: Go to **Basic Information** → App Credentials → copy **Signing Secret**

---

## Step 4 — Add Environment Variables to Vercel (2 min)

1. In Vercel, go to your project → **Settings** → **Environment Variables**
2. Add each of these (use values from `.env.example` as a guide):

| Variable | Where to get it |
|----------|----------------|
| `SLACK_BOT_TOKEN` | Slack App → OAuth & Permissions → Bot User OAuth Token |
| `SLACK_SIGNING_SECRET` | Slack App → Basic Information → Signing Secret |
| `SLACK_DIGEST_CHANNEL_ID` | Right-click any channel in Slack → View channel details → scroll to bottom for the ID (starts with C) |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| `SALES_SECTION_KEYWORD` | The word in your sales channel names (e.g. `sales`) |
| `CRON_SECRET` | Make up any long random string (e.g. `my-secret-cron-key-abc123`) |

3. After adding all variables, go to **Deployments** and click **Redeploy** on the latest deployment.

---

## Step 5 — Test it!

In any Slack channel, type:
```
/scan-sales
```

The bot will scan all your sales channels and post a digest in the channel you set as `SLACK_DIGEST_CHANNEL_ID`.

To scan a single channel:
```
/scan-sales acme-corp
```

---

## Schedule

The cron in `vercel.json` runs the scan **every hour during business hours (9am–6pm, Mon–Fri UTC)**.

To change the schedule, edit `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "0 9-18 * * 1-5"
    }
  ]
}
```

Standard cron syntax — https://crontab.guru is handy for building schedules.

> **Note:** Vercel Hobby (free) plan supports 1 cron job. Pro plan supports more.
> If you're on Hobby, the cron will only fire once per day — use `/scan-sales` manually for more frequent runs.

---

## Troubleshooting

**Bot doesn't respond to /scan-sales**
- Check that the slash command URL in your Slack app matches your Vercel URL exactly
- Check Vercel logs: Project → Functions → click the `scan` function

**"not_in_channel" errors**
- Invite the bot to your sales channels: `/invite @Sales Channel Bot`
- Or give it access to all channels in the Slack App permissions

**Channels not being detected as sales channels**
- Update `SALES_SECTION_KEYWORD` in Vercel env vars to match your naming convention
- Redeploy after changing env vars

**Rename fails**
- Channels with external members (guests) can't be renamed via the API — the bot will skip the rename but still update the topic and pin

---

## File structure

```
sales-channel-bot/
├── api/
│   ├── scan.js          ← Slash command handler (/scan-sales)
│   └── cron.js          ← Scheduled scan endpoint
├── lib/
│   ├── scanner.js       ← Core scan logic + Claude analysis
│   ├── slack-client.js  ← Slack Web API wrapper
│   ├── slack-verify.js  ← Request signature verification
│   └── blocks.js        ← Slack Block Kit message builders
├── vercel.json          ← Cron schedule config
├── package.json
├── slack-app-manifest.yaml  ← Paste into Slack app creation
└── .env.example         ← Environment variable template
```
