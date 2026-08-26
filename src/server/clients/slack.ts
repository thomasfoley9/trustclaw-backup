import { db } from "~/server/clients/db";
import {
  executeComposio,
  asRecord,
  asString,
  asArray,
} from "~/server/ea/composio-exec";
import { claimEvent } from "~/server/ea/events";

// EA Slack client. Posts as the USER (their Composio Slack user connection),
// which is the whole point: the EA talks in Thomas's own #ea channel as him.
// Two invariants live here:
//   1. Loop guard: every message we post records its ts in EaEvent BEFORE the
//      function returns, so the inbound reader can tell agent-authored
//      messages from human ones with per-message certainty.
//   2. Prefix: agent-authored messages carry EA_PREFIX so the human eye can
//      separate the two voices sharing one Slack identity. The prefix is for
//      the reader's eyes; the ts ledger is what the machine trusts.

export const EA_PREFIX = "▸ "; // "▸ "
export const EA_CHANNEL_NAME = "ea";

export function slackOutFingerprint(channel: string, ts: string): string {
  return `slack_out:${channel}:${ts}`;
}

export interface SlackPostResult {
  ok: boolean;
  ts: string | null;
}

// Best-effort posture like telegram.ts: outbound failures log and return
// {ok:false}, they never throw into a sweep or agent loop.
export async function postToEaChannel(
  instanceId: string,
  text: string,
  options: { threadTs?: string; skipPrefix?: boolean } = {},
): Promise<SlackPostResult> {
  try {
    const instance = await db.composioClawInstance.findUnique({
      where: { id: instanceId },
      select: { eaSlackChannelId: true, eaSlackOwnerUserId: true },
    });
    const channel = instance?.eaSlackChannelId;
    if (!channel) return { ok: false, ts: null };

    const body = options.skipPrefix ? text : `${EA_PREFIX}${text}`;
    // Current SLACK_SEND_MESSAGE schema rejects `text` outright ("Use
    // markdown_text for normal content, or fallback_text with blocks") -
    // verified against the live error. markdown_text is the plain-content field.
    const result = await executeComposio(instanceId, "SLACK_SEND_MESSAGE", {
      channel,
      markdown_text: body,
      ...(options.threadTs ? { thread_ts: options.threadTs } : {}),
    });
    if (!result.successful) {
      console.error("[ea/slack] post failed:", result.error);
      return { ok: false, ts: null };
    }

    const ts =
      asString(result.data.ts) ??
      asString(asRecord(result.data.message)?.ts) ??
      null;
    if (ts) {
      await claimEvent(instanceId, slackOutFingerprint(channel, ts), "slack_out", {
        channel,
        ts,
      });
    }

    // Every EA post is authored by the OWNER's Slack identity, so a successful
    // send is a trustworthy source for the owner id that gates inbound. Capture
    // it once, from this ledger-verified message, never from an inbound one.
    if (!instance?.eaSlackOwnerUserId) {
      const author = asString(asRecord(result.data.message)?.user);
      if (author) {
        await db.composioClawInstance
          .update({
            where: { id: instanceId },
            data: { eaSlackOwnerUserId: author },
          })
          .catch(() => undefined);
      }
    }
    return { ok: true, ts };
  } catch (err) {
    console.error(
      "[ea/slack] post error:",
      err instanceof Error ? err.message : err,
    );
    return { ok: false, ts: null };
  }
}

// Find-or-create the private #ea channel and store its id on the instance.
// Referenced by id everywhere after this; the name only matters here.
export async function ensureEaChannel(instanceId: string): Promise<string> {
  const instance = await db.composioClawInstance.findUnique({
    where: { id: instanceId },
    select: { eaSlackChannelId: true },
  });
  if (instance?.eaSlackChannelId) return instance.eaSlackChannelId;

  let channelId: string | undefined;

  const found = await executeComposio(instanceId, "SLACK_FIND_CHANNELS", {
    query: EA_CHANNEL_NAME,
    exact_match: true,
    types: "public_channel,private_channel",
    member_only: true,
  });
  if (found.successful) {
    const channels = asArray(found.data.channels);
    const exact = channels
      .map(asRecord)
      .find((c) => c && asString(c.name) === EA_CHANNEL_NAME);
    channelId = exact ? asString(exact.id) : undefined;
  }

  if (!channelId) {
    const created = await executeComposio(instanceId, "SLACK_CREATE_CHANNEL", {
      name: EA_CHANNEL_NAME,
      is_private: true,
    });
    if (!created.successful) {
      throw new Error(
        `Couldn't find or create the #ea channel: ${created.error ?? "unknown Slack error"}. Create a private channel named "ea" in Slack, then retry.`,
      );
    }
    channelId =
      asString(asRecord(created.data.channel)?.id) ??
      asString(asRecord(asRecord(created.data.data)?.channel)?.id);
    if (!channelId) {
      throw new Error(
        "Slack created the #ea channel but returned no channel id. Retry setup.",
      );
    }
  }

  await db.composioClawInstance.update({
    where: { id: instanceId },
    data: { eaSlackChannelId: channelId },
  });
  return channelId;
}

// Point the EA at a specific EXISTING channel by exact name. Find-only by
// design: an explicit name must already exist with the user as a member -
// a typo should error, never quietly spawn a new channel. Overwrites the
// stored channel id; the caller re-posts the welcome and reseeds the cursor
// so nothing already said in the adopted channel replays as commands.
export async function repointEaChannel(
  instanceId: string,
  name: string,
): Promise<string> {
  const found = await executeComposio(instanceId, "SLACK_FIND_CHANNELS", {
    query: name,
    exact_match: true,
    types: "public_channel,private_channel",
    member_only: true,
  });
  if (!found.successful) {
    throw new Error(
      `Couldn't search your Slack channels: ${found.error ?? "unknown Slack error"}`,
    );
  }
  const exact = asArray(found.data.channels)
    .map(asRecord)
    .find((c) => c && asString(c.name) === name);
  const channelId = exact ? asString(exact.id) : undefined;
  if (!channelId) {
    throw new Error(
      `No channel named "${name}" that you're a member of. Check the name in Slack and retry.`,
    );
  }
  await db.composioClawInstance.update({
    where: { id: instanceId },
    data: { eaSlackChannelId: channelId },
  });
  return channelId;
}

export interface EaInboundMessage {
  ts: string;
  text: string;
  threadTs: string | null;
  // Slack user id of the author. Inbound is gated on this matching the owner.
  user: string | null;
}

// Read #ea messages newer than the stored cursor, oldest first. Thread
// replies are NOT returned by conversations.history; Phase 1 reads the main
// timeline (top-level commands), and thread replies arrive in slice 2 with
// the real-time trigger. Messages the EA itself posted are filtered by the
// loop-guard prefix check here and by the ts ledger in the sweep.
export async function fetchEaMessagesSince(
  instanceId: string,
  channel: string,
  oldestTs: string | null,
  limit = 50,
): Promise<EaInboundMessage[]> {
  const result = await executeComposio(
    instanceId,
    "SLACK_FETCH_CONVERSATION_HISTORY",
    {
      channel,
      limit,
      ...(oldestTs ? { oldest: oldestTs, inclusive: false } : {}),
    },
  );
  if (!result.successful) {
    console.error("[ea/slack] history fetch failed:", result.error);
    return [];
  }
  const messages = asArray(result.data.messages)
    .map(asRecord)
    .flatMap((m) => {
      if (!m) return [];
      const ts = asString(m.ts);
      const text = typeof m.text === "string" ? m.text : "";
      if (!ts) return [];
      // Skip non-message events (joins, topic changes) which carry a subtype.
      if (asString(m.subtype)) return [];
      return [
        {
          ts,
          text,
          threadTs: asString(m.thread_ts) ?? null,
          user: asString(m.user) ?? null,
        },
      ];
    });
  // Slack returns newest first; process oldest first so the cursor advances
  // monotonically.
  return messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
}
