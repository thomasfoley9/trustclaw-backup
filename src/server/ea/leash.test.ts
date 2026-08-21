import { describe, expect, it, vi } from "vitest";

vi.mock("~/server/clients/db", () => ({ db: {} }));

import {
  decideLeash,
  findSendClassSlugs,
  slackPostsConfinedToEa,
} from "./leash";

const EA_CHANNEL = "C0123EA";

describe("findSendClassSlugs", () => {
  it("spots send-class slugs anywhere in a serialized payload", () => {
    const input = JSON.stringify({
      tools: [
        { tool_slug: "GMAIL_SEND_EMAIL", arguments: { to: "x@y.com" } },
        { tool_slug: "GMAIL_FETCH_EMAILS", arguments: {} },
      ],
    });
    expect(findSendClassSlugs(input)).toEqual(["GMAIL_SEND_EMAIL"]);
  });

  it("draft creation is not send-class", () => {
    const input = JSON.stringify({
      tools: [{ tool_slug: "GMAIL_CREATE_EMAIL_DRAFT", arguments: {} }],
    });
    expect(findSendClassSlugs(input)).toEqual([]);
  });

  it("catches slugs buried in workbench code strings", () => {
    const input = JSON.stringify({
      code_to_execute:
        'run_composio_tool("GMAIL_SEND_EMAIL", {"to": "a@b.com"})',
    });
    expect(findSendClassSlugs(input)).toEqual(["GMAIL_SEND_EMAIL"]);
  });
});

describe("slackPostsConfinedToEa", () => {
  it("true only when every channel arg is the #ea channel", () => {
    const ok = JSON.stringify({
      tools: [
        {
          tool_slug: "SLACK_SEND_MESSAGE",
          arguments: { channel: EA_CHANNEL, text: "hi" },
        },
      ],
    });
    expect(slackPostsConfinedToEa(ok, EA_CHANNEL)).toBe(true);

    const mixed = JSON.stringify({
      tools: [
        { tool_slug: "SLACK_SEND_MESSAGE", arguments: { channel: EA_CHANNEL } },
        { tool_slug: "SLACK_SEND_MESSAGE", arguments: { channel: "C0999" } },
      ],
    });
    expect(slackPostsConfinedToEa(mixed, EA_CHANNEL)).toBe(false);
  });

  it("false when no channel is present or no ea channel is configured", () => {
    expect(slackPostsConfinedToEa("{}", EA_CHANNEL)).toBe(false);
    expect(slackPostsConfinedToEa(`"channel":"${EA_CHANNEL}"`, null)).toBe(
      false,
    );
  });
});

describe("decideLeash", () => {
  const ctx = { eaSlackChannelId: EA_CHANNEL };

  it("allows read-only payloads", () => {
    const input = JSON.stringify({
      tools: [{ tool_slug: "GMAIL_FETCH_EMAILS", arguments: {} }],
    });
    expect(decideLeash(input, ctx)).toEqual({ blocked: false });
  });

  it("blocks a Gmail send", () => {
    const input = JSON.stringify({
      tools: [{ tool_slug: "GMAIL_SEND_EMAIL", arguments: {} }],
    });
    expect(decideLeash(input, ctx)).toEqual({
      blocked: true,
      slugs: ["GMAIL_SEND_EMAIL"],
    });
  });

  it("allows Slack posts confined to #ea, blocks posts anywhere else", () => {
    const toEa = JSON.stringify({
      tools: [
        { tool_slug: "SLACK_SEND_MESSAGE", arguments: { channel: EA_CHANNEL } },
      ],
    });
    expect(decideLeash(toEa, ctx)).toEqual({ blocked: false });

    const elsewhere = JSON.stringify({
      tools: [
        { tool_slug: "SLACK_SEND_MESSAGE", arguments: { channel: "C0999" } },
      ],
    });
    expect(decideLeash(elsewhere, ctx).blocked).toBe(true);
  });

  it("blocks calendar invites", () => {
    const input = JSON.stringify({
      tools: [
        {
          tool_slug: "GOOGLECALENDAR_CREATE_EVENT",
          arguments: { attendees: ["a@b.com"] },
        },
      ],
    });
    expect(decideLeash(input, ctx).blocked).toBe(true);
  });

  it("a Slack send mixed with a Gmail send is still blocked", () => {
    const input = JSON.stringify({
      tools: [
        { tool_slug: "SLACK_SEND_MESSAGE", arguments: { channel: EA_CHANNEL } },
        { tool_slug: "GMAIL_SEND_EMAIL", arguments: {} },
      ],
    });
    expect(decideLeash(input, ctx).blocked).toBe(true);
  });

  it("blocks unlisted send-capable slugs, not just the hardcoded list", () => {
    // Slugs the explicit SEND_CLASS list never enumerated - a false negative
    // here would let the agent post publicly while Presence Mode is on.
    for (const slug of [
      "TWITTER_CREATION_OF_A_POST",
      "WHATSAPP_SEND_MESSAGE",
      "DISCORD_POST_MESSAGE",
      "LINKEDIN_CREATE_LINKED_IN_POST",
    ]) {
      const input = JSON.stringify({ tools: [{ tool_slug: slug }] });
      expect(decideLeash(input, ctx).blocked).toBe(true);
    }
  });

  it("does not block read-only slugs via the broadened matcher", () => {
    const input = JSON.stringify({
      tools: [
        { tool_slug: "GMAIL_FETCH_EMAILS" },
        { tool_slug: "SLACK_FETCH_CONVERSATION_HISTORY" },
        { tool_slug: "GOOGLECALENDAR_EVENTS_LIST" },
      ],
    });
    expect(decideLeash(input, ctx).blocked).toBe(false);
  });
});
