import { describe, expect, it } from "vitest";
import { loginPathWithNext, safeNextPath } from "./login-redirect";

describe("safeNextPath", () => {
  it("honors same-origin absolute paths", () => {
    expect(safeNextPath("/dashboard/settings")).toBe("/dashboard/settings");
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/ok?q=1#frag")).toBe("/ok?q=1#frag");
  });

  it("falls back for empty / missing values", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("http://evil.com/x")).toBe("/dashboard");
  });

  // Browsers normalize backslashes to forward slashes, so "/\evil.com"
  // resolves as a protocol-relative redirect to evil.com.
  it("rejects backslash variants of the protocol-relative bypass", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
    expect(safeNextPath("\\/evil.com")).toBe("/dashboard");
    expect(safeNextPath("\\\\evil.com")).toBe("/dashboard");
  });

  it("rejects paths containing control characters", () => {
    expect(safeNextPath("/x\ty")).toBe("/dashboard");
    expect(safeNextPath("/x\ny")).toBe("/dashboard");
  });

  it("honors a custom fallback", () => {
    expect(safeNextPath("//evil.com", "/home")).toBe("/home");
  });
});

describe("loginPathWithNext", () => {
  it("omits next for the default landing", () => {
    expect(loginPathWithNext("/dashboard")).toBe("/login");
    expect(loginPathWithNext("")).toBe("/login");
  });

  it("encodes the current path", () => {
    expect(loginPathWithNext("/dashboard/settings?tab=voice")).toBe(
      "/login?next=%2Fdashboard%2Fsettings%3Ftab%3Dvoice",
    );
  });
});
