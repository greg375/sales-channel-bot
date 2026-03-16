import crypto from "crypto";

/**
 * Verifies that a request genuinely came from Slack using HMAC-SHA256.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export async function verifySlackRequest(headers, rawBody) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.warn("SLACK_SIGNING_SECRET not set — skipping verification");
    return true;
  }

  const slackSignature = headers["x-slack-signature"];
  const timestamp = headers["x-slack-request-timestamp"];

  if (!slackSignature || !timestamp) return false;

  // Reject requests older than 5 minutes (replay attack protection)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const sigBaseString = `v0:${timestamp}:${rawBody.toString()}`;
  const mySignature =
    "v0=" +
    crypto
      .createHmac("sha256", signingSecret)
      .update(sigBaseString, "utf8")
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(mySignature, "utf8"),
    Buffer.from(slackSignature, "utf8")
  );
}
