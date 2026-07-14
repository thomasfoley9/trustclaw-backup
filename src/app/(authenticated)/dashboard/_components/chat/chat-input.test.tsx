// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatStatus } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ModelPicker / VoicePicker mount tRPC query hooks (they need a provider and a
// network); the composer behavior under test does not depend on them.
vi.mock("./model-picker", () => ({ ModelPicker: () => null }));
vi.mock("./voice-picker", () => ({ VoicePicker: () => null }));
// toast-notifications pulls in the tRPC error helpers - stub the whole module.
vi.mock("~/components/core/toast-notifications", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showTrpcErrorToast: vi.fn(),
  trpcToastOnError: vi.fn(),
}));

import { ChatInput } from "./chat-input";

let conversationCounter = 0;

function makeProps(overrides: Partial<Parameters<typeof ChatInput>[0]> = {}) {
  return {
    onSend: vi.fn(),
    onStop: vi.fn(),
    status: "ready" as ChatStatus,
    // Distinct per test: drafts persist to sessionStorage keyed by this id.
    conversationId: `conv-${conversationCounter++}`,
    voiceEnabled: false,
    voiceSpeaking: false,
    onToggleVoice: vi.fn(),
    conversationSupported: false,
    conversationActive: false,
    conversationPhase: "off" as const,
    conversationMuted: false,
    onStartConversation: vi.fn(),
    onStopConversation: vi.fn(),
    onToggleMute: vi.fn(),
    ...overrides,
  };
}

function getComposer(): HTMLTextAreaElement {
  return screen.getByPlaceholderText("Ask me anything...");
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("ChatInput", () => {
  it("renders the composer with send disabled while empty", () => {
    render(<ChatInput {...makeProps()} />);
    expect(getComposer()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("sends trimmed text on Enter and clears the composer", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ChatInput {...props} />);

    const composer = getComposer();
    await user.type(composer, "  hello claw  ");
    await user.type(composer, "{Enter}");

    expect(props.onSend).toHaveBeenCalledTimes(1);
    expect(props.onSend).toHaveBeenCalledWith("hello claw", []);
    expect(composer).toHaveValue("");
  });

  it("sends via the send button too", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ChatInput {...props} />);

    await user.type(getComposer(), "button send");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(props.onSend).toHaveBeenCalledWith("button send", []);
  });

  it("does not send on Shift+Enter (newline instead)", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ChatInput {...props} />);

    const composer = getComposer();
    await user.type(composer, "line one{Shift>}{Enter}{/Shift}line two");

    expect(props.onSend).not.toHaveBeenCalled();
    expect(composer).toHaveValue("line one\nline two");
  });

  it("does not send Enter during IME composition (keyCode 229)", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ChatInput {...props} />);

    const composer = getComposer();
    await user.type(composer, "nihao");
    // Browsers that fire the key event before compositionend report keyCode 229.
    fireEvent.keyDown(composer, { key: "Enter", keyCode: 229 });

    expect(props.onSend).not.toHaveBeenCalled();
    expect(composer).toHaveValue("nihao");
  });

  it("does not send Enter while a composition session is active (isComposing)", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<ChatInput {...props} />);

    const composer = getComposer();
    await user.type(composer, "kanji");
    fireEvent.keyDown(composer, { key: "Enter", isComposing: true });

    expect(props.onSend).not.toHaveBeenCalled();
  });

  describe("while streaming", () => {
    it("shows the stop button instead of send and wires it to onStop", async () => {
      const user = userEvent.setup();
      const props = makeProps({ status: "streaming" as ChatStatus });
      render(<ChatInput {...props} />);

      expect(
        screen.queryByRole("button", { name: "Send message" }),
      ).not.toBeInTheDocument();
      const stop = screen.getByRole("button", { name: "Stop response" });
      await user.click(stop);
      expect(props.onStop).toHaveBeenCalledTimes(1);
    });

    it("allows type-ahead but blocks Enter from sending", async () => {
      const user = userEvent.setup();
      const props = makeProps({ status: "streaming" as ChatStatus });
      render(<ChatInput {...props} />);

      const composer = getComposer();
      await user.type(composer, "queued question");
      expect(composer).toHaveValue("queued question");

      await user.type(composer, "{Enter}");
      expect(props.onSend).not.toHaveBeenCalled();
      // The draft survives so nothing typed ahead is lost.
      expect(composer).toHaveValue("queued question");
    });

    it("treats submitted status and background runs as streaming too", () => {
      const { unmount } = render(
        <ChatInput {...makeProps({ status: "submitted" as ChatStatus })} />,
      );
      expect(
        screen.getByRole("button", { name: "Stop response" }),
      ).toBeInTheDocument();
      unmount();

      render(<ChatInput {...makeProps({ backgroundBusy: true })} />);
      expect(
        screen.getByRole("button", { name: "Stop response" }),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Answering in the background..."),
      ).toBeInTheDocument();
    });
  });

  describe("message-too-long state", () => {
    it("blocks sending and shows the length warning", () => {
      const props = makeProps();
      render(<ChatInput {...props} />);

      const composer = getComposer();
      // 32,000 is the cap; one char over trips the guard. fireEvent.change
      // because typing 32k chars through userEvent takes minutes.
      fireEvent.change(composer, { target: { value: "x".repeat(32_001) } });

      expect(screen.getByText(/Message is too long/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Send message" }),
      ).toBeDisabled();

      fireEvent.keyDown(composer, { key: "Enter" });
      expect(props.onSend).not.toHaveBeenCalled();
    });

    it("allows exactly the cap", () => {
      const props = makeProps();
      render(<ChatInput {...props} />);

      fireEvent.change(getComposer(), {
        target: { value: "x".repeat(32_000) },
      });

      expect(screen.queryByText(/Message is too long/)).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Send message" }),
      ).toBeEnabled();
    });
  });

  describe("draft persistence", () => {
    it("restores the sessionStorage draft for the same conversation", async () => {
      const user = userEvent.setup();
      const props = makeProps();
      const { unmount } = render(<ChatInput {...props} />);

      await user.type(getComposer(), "work in progress");
      unmount();

      render(<ChatInput {...makeProps({ conversationId: props.conversationId })} />);
      expect(getComposer()).toHaveValue("work in progress");
    });

    it("keeps drafts isolated per conversation", async () => {
      const user = userEvent.setup();
      const { unmount } = render(<ChatInput {...makeProps()} />);
      await user.type(getComposer(), "for conversation A");
      unmount();

      render(<ChatInput {...makeProps()} />);
      expect(getComposer()).toHaveValue("");
    });

    it("clears the stored draft after sending", async () => {
      const user = userEvent.setup();
      const props = makeProps();
      render(<ChatInput {...props} />);

      const composer = getComposer();
      await user.type(composer, "send me");
      expect(
        sessionStorage.getItem(`trustclaw-draft:${props.conversationId}`),
      ).toBe("send me");

      await user.type(composer, "{Enter}");
      expect(
        sessionStorage.getItem(`trustclaw-draft:${props.conversationId}`),
      ).toBeNull();
    });
  });
});
