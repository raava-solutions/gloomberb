import { describe, expect, test } from "bun:test";
import { AiStructuredStreamParser } from "./stream-events";

describe("AI structured stream parser", () => {
  test("renders only Claude text deltas across arbitrary chunks", () => {
    const parser = new AiStructuredStreamParser("claude");
    parser.push('{"type":"system","subtype":"init"}\n{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel');
    const current = parser.push('lo"}}}\n{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}}\n');
    const final = parser.finish();

    expect(current.transcript).toBe("Hello world");
    expect(final.terminalError).toBeNull();
  });

  test("captures provider-owned session ids from structured envelopes", () => {
    const claude = new AiStructuredStreamParser("claude");
    claude.push('{"type":"system","subtype":"init","session_id":"claude-session"}\n');
    expect(claude.sessionId()).toBe("claude-session");

    const codex = new AiStructuredStreamParser("codex");
    codex.push('{"type":"thread.started","thread_id":"codex-session"}\n');
    expect(codex.sessionId()).toBe("codex-session");

    const pi = new AiStructuredStreamParser("pi");
    pi.push('{"type":"session","id":"pi-session"}\n');
    expect(pi.sessionId()).toBe("pi-session");
  });

  test("replaces Codex in-progress agent messages and ignores reasoning events", () => {
    const parser = new AiStructuredStreamParser("codex");
    parser.push([
      JSON.stringify({ type: "item.completed", item: { id: "r1", type: "reasoning", text: "private" } }),
      JSON.stringify({ type: "item.started", item: { id: "a1", type: "agent_message", text: "Draft" } }),
      JSON.stringify({ type: "item.updated", item: { id: "a1", type: "agent_message", text: "Final answer" } }),
      "",
    ].join("\n"));

    expect(parser.finish().transcript).toBe("Final answer");
  });

  test("reports terminal and malformed structured errors without displaying metadata", () => {
    const failed = new AiStructuredStreamParser("codex");
    failed.push('{"type":"turn.failed","error":{"message":"Authentication required"}}\n');
    expect(failed.finish()).toEqual({ transcript: "", terminalError: "Authentication required" });

    const malformed = new AiStructuredStreamParser("claude");
    expect(() => malformed.push("not-json\n")).toThrow("Claude returned malformed structured output");
  });

  test("renders Pi text deltas while ignoring envelope events", () => {
    const parser = new AiStructuredStreamParser("pi");
    parser.push([
      JSON.stringify({ type: "session", id: "session-1" }),
      JSON.stringify({ type: "agent_start" }),
      JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "ok" } }),
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } }),
      JSON.stringify({ type: "turn_end" }),
      JSON.stringify({ type: "agent_settled" }),
      "",
    ].join("\n"));

    expect(parser.finish()).toEqual({ transcript: "ok", terminalError: null });
  });

  test("reports Pi terminal errors", () => {
    const parser = new AiStructuredStreamParser("pi");
    parser.push('{"type":"error","message":"boom"}\n');

    expect(parser.finish().terminalError).toBe("boom");
  });

  test("labels malformed Pi output", () => {
    const parser = new AiStructuredStreamParser("pi");

    expect(() => parser.push("not-json\n")).toThrow("Pi returned malformed structured output");
  });
});
