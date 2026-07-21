import { describe, expect, test } from "bun:test";
import { shouldConsumeWebAppKeyDown, shouldDispatchWebAppKeyDown } from "./key-event";

function keyEvent(overrides: Record<string, unknown>) {
  return {
    key: "x",
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
  } as never;
}

describe("shouldConsumeWebAppKeyDown", () => {
  test("consumes non-editable app keydowns", () => {
    expect(shouldConsumeWebAppKeyDown(keyEvent({ key: "+" }))).toBe(true);
    expect(shouldConsumeWebAppKeyDown(keyEvent({ key: "ArrowDown", target: { tagName: "DIV" } }))).toBe(true);
  });

  test("preserves native editing and control targets", () => {
    expect(shouldConsumeWebAppKeyDown(keyEvent({ target: { tagName: "INPUT" } }))).toBe(false);
    expect(shouldConsumeWebAppKeyDown(keyEvent({ target: { tagName: "TEXTAREA" } }))).toBe(false);
    expect(shouldConsumeWebAppKeyDown(keyEvent({ target: { tagName: "DIV", isContentEditable: true } }))).toBe(false);
    expect(shouldConsumeWebAppKeyDown(keyEvent({ key: "Enter", target: { tagName: "BUTTON" } }))).toBe(false);
    expect(shouldConsumeWebAppKeyDown(keyEvent({ key: "+", target: { tagName: "BUTTON" } }))).toBe(true);
  });

  test("preserves browser modifier shortcuts unless they are terminal-style ctrl-shift shortcuts", () => {
    expect(shouldConsumeWebAppKeyDown(keyEvent({ key: "c", ctrlKey: true }))).toBe(false);
    expect(shouldConsumeWebAppKeyDown(keyEvent({ key: "c", metaKey: true }))).toBe(false);
    expect(shouldConsumeWebAppKeyDown(keyEvent({ key: "c", ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  test("leaves native Tab focus traversal available from the app root and its controls", () => {
    const root = { tagName: "DIV", getAttribute: (name: string) => name === "id" ? "root" : null };
    const button = { tagName: "BUTTON" };

    for (const target of [root, button]) {
      const event = keyEvent({ key: "Tab", target });
      expect(shouldDispatchWebAppKeyDown(event)).toBe(false);
      expect(shouldConsumeWebAppKeyDown(event)).toBe(false);
    }
    expect(shouldDispatchWebAppKeyDown(keyEvent({ key: "Tab", shiftKey: true, target: button }))).toBe(false);
  });
});
