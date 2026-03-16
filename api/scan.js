import { verifySlackRequest } from "../lib/slack-verify.js";
import { scanAllChannels, scanSingleChannel } from "../lib/scanner.js";
import { postEphemeral, postMessage } from "../lib/slack-client.js";

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // Verify signing secret
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  const slackSig = req.headers["x-slack-signature"];
  const timestamp = req.headers["x-slack-request-timestamp"];

  if (!slackSig || !timestamp || !signingSecret) {
    return res.status(401).send("Unauthorized");
  }

  // Replay attack protection
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return res.status(401).send("Request too old");
  }

  // Verify signature
  const crypto = await import("crypto");
  const body = typeof req.body === "string" ? req.body : new URLSearchParams(req.body).toString();
  const sigBase = `v0:${timestamp}:${body}`;
  const expected = "v0=" + crypto.default.createHmac("sha256", signingSecret).update(sigBase).digest("hex");

  if (!crypto.default.timingSafeEqual(Buffer.from(expected), Buffer.from(slackSig))) {
    return res.status(401).send("Invalid signature");
  }

  // Parse params
  let params;
  if (typeof req.body === "object" && req.body !== null) {
    params = req.body;
  } else {
    params = Object.fromEntries(new URLSearchParams(req.body));
  }

  const channelId = params.channel_id;
  const text = (params.text || "").trim();
  const digestChannelId = process.env.SLACK_DIGEST_CHANNEL_ID || channelId;

  // Respond to Slack immediately (3s limit)
  res.status(200).json({
    response_type: "ephemeral",
    text: text
      ? `🔍 Scanning *#${text}*… results will post shortly.`
      : `⚡ Scan starting… digest will post in <#${digestChannelId}>.`,
  });

  // Run the scan
  try {
    const { scanAllChannels, scanSingleChannel } = await import("../lib/scanner.js");
    if (text) {
      await scanSingleChannel(text, channelId);
    } else {
      await scanAllChannels(digestChannelId);
    }
  } catch (err) {
    console.error("Scan error:", err);
    try {
      const { postMessage } = await import("../lib/slack-client.js");
      await postMessage(digestChannelId, `❌ Scan failed: ${err.message}`);
    } catch {}
  }
}
