import { scanAllChannels } from "../lib/scanner.js";
import { postMessage } from "../lib/slack-client.js";

// Vercel cron — configured in vercel.json
// Runs on the schedule defined there (default: every 60 min during business hours)
export default async function handler(req, res) {
  // Protect cron endpoint
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("⏰ Cron scan triggered at", new Date().toISOString());

  try {
    const digestChannelId = process.env.SLACK_DIGEST_CHANNEL_ID;
    if (!digestChannelId) throw new Error("SLACK_DIGEST_CHANNEL_ID not set");

    await scanAllChannels(digestChannelId);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Cron scan failed:", err);
    res.status(500).json({ error: err.message });
  }
}
