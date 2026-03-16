import {
  getChannels,
  getChannelHistory,
  getUserName,
  renameChannel,
  setChannelTopic,
  postMessage,
  pinMessage,
  unpinAll,
} from "./slack-client.js";
import { buildDigestBlocks, buildChannelResultBlocks } from "./blocks.js";

const SECTION_KEYWORD = process.env.SALES_SECTION_KEYWORD || "sales";

/** Filter channels that look like sales/deal channels */
function isSalesChannel(ch) {
  const name = ch.name.toLowerCase();
  const keyword = SECTION_KEYWORD.toLowerCase();
  // Include channels matching the keyword OR that look like client channels
  // (2+ words joined by hyphens, suggesting person/company names)
  return (
    name.includes(keyword) ||
    (name.split("-").length >= 2 && !name.startsWith("general") && !name.startsWith("random"))
  );
}

/** Resolve user IDs in messages to real names */
async function resolveMessages(messages) {
  const nameCache = {};
  const lines = [];
  for (const msg of messages) {
    if (msg.subtype) continue; // skip joins/leaves/etc
    const uid = msg.user;
    if (!uid) continue;
    if (!nameCache[uid]) nameCache[uid] = await getUserName(uid);
    lines.push(`${nameCache[uid]}: ${msg.text}`);
  }
  return lines.join("\n");
}

/** Call Claude (no MCP needed for analysis) */
async function analyzeWithClaude(messagesText, channelName) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system:
        "You are a sales ops assistant. Analyze Slack messages and return ONLY valid JSON, no markdown, no backticks, no preamble.",
      messages: [
        {
          role: "user",
          content: `Analyze these Slack messages from a sales channel called "${channelName}" and return a JSON object with these fields:
- newName: short slug (lowercase, hyphens, max 80 chars) based on the CLIENT company name only (e.g. "acme-corp"). If you cannot identify a client, keep the existing name.
- account: full company/client name (or "Unknown" if unclear)
- am: name of the Account Manager or main internal sales rep (or "Unknown")
- nextMeeting: date and purpose (e.g. "Mar 20 — Technical Demo") or "Not scheduled"
- deliverable: what needs to be prepared next (1 sentence max) or "None identified"
- pinnedMessage: a clean summary to pin in the channel. Use plain text and emoji (no ** or ## markdown). Include: account name, AM, next meeting, deliverable.
- topic: one-line channel topic, max 80 chars

Messages:
${messagesText}`,
        },
      ],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Claude API error: ${data.error.message}`);
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

/** Process a single channel — analyze and apply all changes */
export async function processSingleChannel(channel) {
  const result = {
    originalName: channel.name,
    id: channel.id,
    newName: channel.name,
    skippedRename: false,
    error: null,
  };

  try {
    // 1. Fetch messages
    const messages = await getChannelHistory(channel.id, 40);
    const messagesText = await resolveMessages(messages);

    if (messagesText.length < 50) {
      result.skipped = true;
      result.skipReason = "Not enough messages to analyze";
      return result;
    }

    // 2. Analyze with Claude
    const analysis = await analyzeWithClaude(messagesText, channel.name);
    Object.assign(result, analysis);

    // 3. Rename channel
    const newSlug = analysis.newName
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    if (newSlug && newSlug !== channel.name) {
      try {
        await renameChannel(channel.id, newSlug);
        result.newName = newSlug;
      } catch (err) {
        result.skippedRename = true;
        result.skippedRenameReason = err.message;
      }
    }

    // 4. Set topic
    if (analysis.topic) {
      await setChannelTopic(channel.id, analysis.topic).catch(() => {});
    }

    // 5. Unpin old pins and post + pin new summary
    if (analysis.pinnedMessage) {
      await unpinAll(channel.id).catch(() => {});
      const posted = await postMessage(channel.id, analysis.pinnedMessage);
      if (posted?.ts) {
        await pinMessage(channel.id, posted.ts).catch(() => {});
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

/** Scan all sales channels and post a digest */
export async function scanAllChannels(digestChannelId) {
  const allChannels = await getChannels();
  const salesChannels = allChannels.filter(isSalesChannel);

  console.log(`Found ${salesChannels.length} sales channels to scan`);

  if (salesChannels.length === 0) {
    await postMessage(
      digestChannelId,
      `⚠️ No sales channels found. Set the SALES_SECTION_KEYWORD env var to match your channel naming convention.`
    );
    return;
  }

  // Post a "starting" message
  await postMessage(
    digestChannelId,
    `⚡ Starting scan of ${salesChannels.length} sales channels…`
  );

  const results = [];
  for (const ch of salesChannels) {
    console.log(`Scanning #${ch.name}…`);
    const result = await processSingleChannel(ch);
    results.push(result);
  }

  // Post digest
  const blocks = buildDigestBlocks(results);
  await postMessage(
    digestChannelId,
    `✅ Sales channel scan complete — ${results.filter((r) => !r.error && !r.skipped).length}/${salesChannels.length} updated`,
    blocks
  );
}

/** Scan a single channel by name and post result */
export async function scanSingleChannel(channelName, responseChannelId) {
  const allChannels = await getChannels();
  const match = allChannels.find(
    (ch) => ch.name === channelName.replace(/^#/, "")
  );

  if (!match) {
    await postMessage(responseChannelId, `❌ Channel *#${channelName}* not found.`);
    return;
  }

  const result = await processSingleChannel(match);
  const blocks = buildChannelResultBlocks(result);
  await postMessage(
    responseChannelId,
    result.error ? `❌ Error scanning #${channelName}: ${result.error}` : `✅ Scanned #${result.newName}`,
    blocks
  );
}
