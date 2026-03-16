import { verifySlackRequest } from "../lib/slack-verify.js";
import { scanAllChannels, scanSingleChannel } from "../lib/scanner.js";
import { postEphemeral, postMessage } from "../lib/slack-client.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // Verify the request came from Slack
  const rawBody = await getRawBody(req);
  const isValid = await verifySlackRequest(req.headers, rawBody);
  if (!isValid) return res.status(401).send("Unauthorized");

  const params = new URLSearchParams(rawBody.toString());
  const userId = params.get("user_id");
  const channelId = params.get("channel_id");
  const text = (params.get("text") || "").trim();

  // Acknowledge Slack immediately (must respond within 3s)
  res.status(200).json({
    response_type: "ephemeral",
    text: text
      ? `🔍 Scanning channel *#${text}*… I'll post results in <#${channelId}>.`
      : `⚡ Starting full sales channel scan… I'll post a digest in <#${process.env.SLACK_DIGEST_CHANNEL_ID || channelId}> when done.`,
  });

  // Do the heavy work async (fire and forget — Vercel allows up to 5min on Pro, 10s on Hobby)
  // We use a background task pattern via setTimeout to not block the response
  setTimeout(async () => {
    try {
      if (text) {
        // /scan-sales <channel-name> — scan one channel
        await scanSingleChannel(text, channelId);
      } else {
        // /scan-sales — scan everything
        await scanAllChannels(channelId);
      }
    } catch (err) {
      console.error("Scan failed:", err);
      await postMessage(
        process.env.SLACK_DIGEST_CHANNEL_ID || channelId,
        `❌ Scan failed: ${err.message}`
      );
    }
  }, 0);
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
