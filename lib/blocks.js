/**
 * Slack Block Kit builders
 * https://api.slack.com/block-kit
 */

function divider() {
  return { type: "divider" };
}

function header(text) {
  return {
    type: "header",
    text: { type: "plain_text", text, emoji: true },
  };
}

function section(text) {
  return {
    type: "section",
    text: { type: "mrkdwn", text },
  };
}

function fields(items) {
  return {
    type: "section",
    fields: items.map((i) => ({ type: "mrkdwn", text: i })),
  };
}

function context(text) {
  return {
    type: "context",
    elements: [{ type: "mrkdwn", text }],
  };
}

/** Build a Block Kit message for a single channel scan result */
export function buildChannelResultBlocks(result) {
  if (result.skipped) {
    return [
      section(`⏭️ *#${result.originalName}* — skipped\n_${result.skipReason}_`),
    ];
  }

  if (result.error) {
    return [
      section(`❌ *#${result.originalName}* — error\n\`${result.error}\``),
    ];
  }

  const nameChanged = result.newName !== result.originalName;
  const blocks = [];

  blocks.push(
    section(
      nameChanged
        ? `✅ *#${result.newName}* _(was #${result.originalName})_`
        : `✅ *#${result.newName}*`
    )
  );

  blocks.push(
    fields([
      `*🏢 Account*\n${result.account || "—"}`,
      `*👤 Account Manager*\n${result.am || "—"}`,
      `*📅 Next Meeting*\n${result.nextMeeting || "—"}`,
      `*📦 Deliverable*\n${result.deliverable || "—"}`,
    ])
  );

  if (result.topic) {
    blocks.push(context(`💬 Topic set: _${result.topic}_`));
  }

  if (result.skippedRename) {
    blocks.push(
      context(`⚠️ Rename skipped — channel may have external members`)
    );
  }

  return blocks;
}

/** Build a digest Block Kit message for all channel scan results */
export function buildDigestBlocks(results) {
  const updated = results.filter((r) => !r.error && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const errors = results.filter((r) => r.error);

  const blocks = [];

  blocks.push(header("📊 Sales Channel Scan Complete"));

  blocks.push(
    fields([
      `*✅ Updated*\n${updated.length}`,
      `*⏭️ Skipped*\n${skipped.length}`,
      `*❌ Errors*\n${errors.length}`,
      `*🕐 Run at*\n${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`,
    ])
  );

  blocks.push(divider());

  if (updated.length > 0) {
    blocks.push(section("*Updated channels:*"));
    for (const r of updated) {
      const nameChanged = r.newName !== r.originalName;
      blocks.push(
        section(
          [
            nameChanged
              ? `• *#${r.newName}* _(was #${r.originalName})_`
              : `• *#${r.newName}*`,
            `  ${r.account ? `🏢 ${r.account}` : ""}${r.am ? `  👤 ${r.am}` : ""}`,
            r.nextMeeting && r.nextMeeting !== "Not scheduled"
              ? `  📅 ${r.nextMeeting}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        )
      );
    }
  }

  if (errors.length > 0) {
    blocks.push(divider());
    blocks.push(section("*Errors:*"));
    for (const r of errors) {
      blocks.push(section(`• #${r.originalName}: \`${r.error}\``));
    }
  }

  blocks.push(divider());
  blocks.push(
    context(
      `Triggered by scheduled scan · Use \`/scan-sales\` to run manually · Use \`/scan-sales <channel-name>\` for a single channel`
    )
  );

  return blocks;
}
