// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const showInfoToast = vi.fn<(message: string) => void>();
vi.mock("~/components/core/toast-notifications", () => ({
  showInfoToast: (message: string) => {
    showInfoToast(message);
  },
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showTrpcErrorToast: vi.fn(),
  trpcToastOnError: vi.fn(),
}));

// Avatar rendering pulls in the 200-avatar SVG module; irrelevant here.
vi.mock("~/app/_components/personality-avatar", () => ({
  PersonalityAvatar: () => null,
}));

const mutateAsync = vi.fn(() => Promise.resolve({}));
vi.mock("~/clients/trpc", () => ({
  trpc: {
    useUtils: () => ({
      trustclaw: {
        getPersonalities: {
          cancel: vi.fn(() => Promise.resolve()),
          getData: vi.fn(),
          setData: vi.fn(),
          invalidate: vi.fn(),
        },
      },
    }),
    trustclaw: {
      getPersonalities: {
        useQuery: () => ({
          data: {
            activePersonalityId: "p1",
            personalities: [
              { id: "p1", name: "Deadpan", avatarKey: "a" },
              { id: "p2", name: "Gordon Ramsay", avatarKey: "b" },
            ],
          },
        }),
      },
      updateSettings: {
        useMutation: () => ({ mutateAsync, isPending: false }),
      },
    },
  },
}));

import { useVoiceCallStore } from "./chat/voice-call-store";
import { PersonalityControl } from "./personality-control";

// Radix Select drives its listbox with Pointer Capture + scrollIntoView, none
// of which jsdom implements. Stub them so the dropdown can actually open.
beforeAll(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<
    string,
    unknown
  >;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

async function switchToRamsay() {
  await userEvent.click(screen.getByLabelText("Personality"));
  await userEvent.click(await screen.findByText("Gordon Ramsay"));
}

beforeEach(() => {
  showInfoToast.mockClear();
  mutateAsync.mockClear();
  useVoiceCallStore.setState({ liveCallActive: false });
});

afterEach(() => {
  cleanup();
});

describe("PersonalityControl mid-call switching", () => {
  it("warns that the running call keeps its voice, naming the next-call persona", async () => {
    useVoiceCallStore.setState({ liveCallActive: true });
    render(<PersonalityControl />);

    await switchToRamsay();

    // The switch itself still goes through - we inform, we don't block.
    expect(mutateAsync).toHaveBeenCalledWith({ activePersonalityId: "p2" });
    await waitFor(() => expect(showInfoToast).toHaveBeenCalledTimes(1));
    const msg = showInfoToast.mock.calls[0]![0];
    // Scoped to the VOICE on purpose: the delegate re-reads the persona per
    // turn, so claiming the whole call is unaffected would be false.
    expect(msg).toContain("voice on this call won't change");
    expect(msg).toContain("Gordon Ramsay");
    expect(msg).toContain("next call");
  });

  it("stays quiet when no call is running", async () => {
    render(<PersonalityControl />);

    await switchToRamsay();

    expect(mutateAsync).toHaveBeenCalledWith({ activePersonalityId: "p2" });
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(showInfoToast).not.toHaveBeenCalled();
  });

  it("does not warn when the switch fails", async () => {
    useVoiceCallStore.setState({ liveCallActive: true });
    mutateAsync.mockImplementationOnce(() => Promise.reject(new Error("nope")));
    render(<PersonalityControl />);

    await switchToRamsay();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(showInfoToast).not.toHaveBeenCalled();
  });
});
