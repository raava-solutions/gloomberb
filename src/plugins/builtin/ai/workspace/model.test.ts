import { describe, expect, test } from "bun:test";
import {
  appendLocalAgentMessages,
  buildLocalAgentPrompt,
  createLocalAgentThread,
  EMPTY_LOCAL_AGENT_WORKSPACE,
  getLocalAgentToolPosture,
  normalizeLocalAgentWorkspace,
  toggleLocalAgentToolMode,
  updateLocalAgentThread,
} from "./model";

describe("local agent workspace model", () => {
  test("binds a provider at creation and refuses later provider mutation", () => {
    const created = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "claude", {
      id: "thread-1",
      now: 10,
    });
    const attemptedMutation = updateLocalAgentThread(created, "thread-1", (thread) => ({
      ...thread,
      providerId: "codex",
    }));

    expect(attemptedMutation.threads[0]?.providerId).toBe("claude");
    expect(attemptedMutation.threads[0]?.toolMode).toBe("confined");
  });

  test("defaults legacy tool posture to confined and validates explicit values", () => {
    const created = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "codex", { id: "thread-1", now: 1 });
    const thread = created.threads[0]!;
    const legacy = normalizeLocalAgentWorkspace({ ...created, threads: [{ ...thread, toolMode: undefined }] });
    const yolo = normalizeLocalAgentWorkspace({ ...created, threads: [{ ...thread, toolMode: "yolo" }] });
    const invalid = normalizeLocalAgentWorkspace({ ...created, threads: [{ ...thread, toolMode: "unsafe" }] });

    expect(legacy.threads[0]?.toolMode ?? "confined").toBe("confined");
    expect(yolo.threads[0]?.toolMode).toBe("yolo");
    expect(invalid.threads).toEqual([]);
  });

  test("exposes persistent confined and YOLO safety copy", () => {
    expect(getLocalAgentToolPosture(undefined)).toEqual({
      mode: "confined",
      footer: "Tools: confined · Network: off",
      warning: null,
    });
    expect(getLocalAgentToolPosture("yolo")).toEqual({
      mode: "yolo",
      footer: "Tools: YOLO · Network: on",
      warning: "YOLO mode - runs shell, edits real files, reaches network",
    });
  });

  test("resets the provider session whenever posture changes", () => {
    const created = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "claude", { id: "thread-1", now: 1 });
    const confined = { ...created.threads[0]!, sessionId: "session-1" };
    const yolo = toggleLocalAgentToolMode(confined);
    const confinedAgain = toggleLocalAgentToolMode({ ...yolo, sessionId: "session-2" });

    expect(yolo.toolMode).toBe("yolo");
    expect(yolo.sessionId).toBeUndefined();
    expect(confinedAgain.toolMode).toBe("confined");
    expect(confinedAgain.sessionId).toBeUndefined();
  });

  test("creates a second provider thread without changing the first transcript", () => {
    const claude = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "claude", { id: "claude-1", now: 10 });
    const withMessage = appendLocalAgentMessages(claude, "claude-1", [{
      id: "message-1",
      role: "assistant",
      content: "Original answer",
      createdAt: 11,
      status: "complete",
    }]);
    const codex = createLocalAgentThread(withMessage, "codex", { id: "codex-1", now: 12 });

    expect(codex.activeThreadId).toBe("codex-1");
    expect(codex.threads.find((thread) => thread.id === "claude-1")?.messages[0]?.content).toBe("Original answer");
  });

  test("normalizes and creates Pi threads with the Pi title", () => {
    const normalized = normalizeLocalAgentWorkspace({
      activeThreadId: "pi-1",
      threads: [{
        id: "pi-1",
        providerId: "pi",
        title: "Pi research",
        createdAt: 1,
        updatedAt: 1,
        messages: [],
      }],
    });
    const created = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "pi", { id: "pi-2", now: 2 });

    expect(normalized.threads[0]?.providerId).toBe("pi");
    expect(created.threads[0]?.providerId).toBe("pi");
    expect(created.threads[0]?.title).toContain("Pi");
  });

  test("sends no financial context unless the user selected an attachment", () => {
    const state = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "codex", { id: "thread-1", now: 10 });
    const thread = state.threads[0];
    if (!thread) throw new Error("Expected a created thread");
    const withoutContext = buildLocalAgentPrompt(thread, "Compare the risks", []);
    const withContext = buildLocalAgentPrompt(thread, "Compare the risks", [{
      id: "ticker:AAPL:10",
      kind: "ticker",
      label: "Ticker AAPL",
      preview: "Apple Inc. (AAPL)",
      content: "Company: Apple Inc. (AAPL)\nCurrent Price: $210.00",
    }]);

    expect(withoutContext).not.toContain("Apple Inc.");
    expect(withoutContext).not.toContain("$210.00");
    expect(withContext).toContain("Context explicitly attached by the user");
    expect(withContext).toContain("Company: Apple Inc. (AAPL)");
  });

  test("sends only the current turn and explicit attachments when resuming", () => {
    const state = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "claude", { id: "thread-1", now: 10 });
    const withHistory = appendLocalAgentMessages(state, "thread-1", [
      { id: "m1", role: "user", content: "Old question", createdAt: 11 },
      { id: "m2", role: "assistant", content: "Old answer", createdAt: 12, status: "complete" },
    ]);
    const thread = { ...withHistory.threads[0]!, sessionId: "session-1" };

    const prompt = buildLocalAgentPrompt(thread, "New question", [{
      id: "ticker:AAPL:13",
      kind: "ticker",
      label: "Ticker AAPL",
      preview: "Apple",
      content: "Attached facts",
    }]);

    expect(prompt).not.toContain("Old question");
    expect(prompt).not.toContain("Old answer");
    expect(prompt).toContain("Attached facts");
    expect(prompt).toContain("Current user request:\nNew question");
  });

  test("replays the visible transcript when there is no resumable session", () => {
    const state = createLocalAgentThread(EMPTY_LOCAL_AGENT_WORKSPACE, "codex", { id: "thread-1", now: 10 });
    const withHistory = appendLocalAgentMessages(state, "thread-1", [
      { id: "m1", role: "user", content: "Old question", createdAt: 11 },
      { id: "m2", role: "assistant", content: "Old answer", createdAt: 12, status: "complete" },
    ]);

    const prompt = buildLocalAgentPrompt(withHistory.threads[0]!, "New question", []);

    expect(prompt).toContain("User: Old question");
    expect(prompt).toContain("Assistant: Old answer");
    expect(prompt).toContain("Current user request:\nNew question");
  });

  test("drops malformed persisted threads and preserves ordered messages", () => {
    const normalized = normalizeLocalAgentWorkspace({
      activeThreadId: "thread-1",
      threads: [{
        id: "thread-1",
        providerId: "claude",
        title: "Research",
        createdAt: 1,
        updatedAt: 3,
        messages: [
          { id: "m1", role: "user", content: "First", createdAt: 2 },
          { id: "m2", role: "assistant", content: "Second", createdAt: 3, status: "complete" },
        ],
      }, { id: "bad", providerId: "gemini", messages: [] }],
    });

    expect(normalized.threads).toHaveLength(1);
    expect(normalized.threads[0]?.messages.map((message) => message.content)).toEqual(["First", "Second"]);
  });

  test("preserves an optional opaque session id and rejects malformed values", () => {
    const valid = normalizeLocalAgentWorkspace({
      activeThreadId: "thread-1",
      threads: [{
        id: "thread-1",
        providerId: "pi",
        sessionId: "session-1",
        title: "Research",
        createdAt: 1,
        updatedAt: 1,
        messages: [],
      }],
    });
    const invalid = normalizeLocalAgentWorkspace({
      activeThreadId: "thread-2",
      threads: [{
        id: "thread-2",
        providerId: "pi",
        sessionId: 42,
        title: "Research",
        createdAt: 1,
        updatedAt: 1,
        messages: [],
      }],
    });

    expect(valid.threads[0]?.sessionId).toBe("session-1");
    expect(invalid.threads).toHaveLength(0);
  });
});
