const SLACK_TOKEN = () => process.env.SLACK_BOT_TOKEN;
const BASE = "https://slack.com/api";

async function slackCall(method, body) {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_TOKEN()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

export async function getChannels() {
  let channels = [];
  let cursor;
  do {
    const data = await slackCall("conversations.list", {
      types: "public_channel,private_channel",
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    channels = channels.concat(data.channels || []);
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);
  return channels;
}

export async function getChannelHistory(channelId, limit = 30) {
  const data = await slackCall("conversations.history", {
    channel: channelId,
    limit,
  });
  return data.messages || [];
}

export async function getUserName(userId) {
  try {
    const data = await slackCall("users.info", { user: userId });
    return data.user?.real_name || data.user?.name || userId;
  } catch {
    return userId;
  }
}

export async function renameChannel(channelId, newName) {
  return slackCall("conversations.rename", { channel: channelId, name: newName });
}

export async function setChannelTopic(channelId, topic) {
  return slackCall("conversations.setTopic", { channel: channelId, topic });
}

export async function postMessage(channelId, text, blocks) {
  return slackCall("chat.postMessage", {
    channel: channelId,
    text,
    ...(blocks ? { blocks } : {}),
  });
}

export async function pinMessage(channelId, timestamp) {
  return slackCall("pins.add", { channel: channelId, timestamp });
}

export async function unpinAll(channelId) {
  try {
    const data = await slackCall("pins.list", { channel: channelId });
    const pins = data.items || [];
    for (const pin of pins) {
      const ts = pin.message?.ts;
      if (ts) {
        await slackCall("pins.remove", { channel: channelId, timestamp: ts }).catch(() => {});
      }
    }
  } catch {
    // Non-critical — ignore errors
  }
}
