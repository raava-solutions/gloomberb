import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync } from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiProvider } from "./providers";
import {
  checkAiProviderStatus,
  checkStatusWithBun,
  ensureIsolatedThreadWorkspace,
  isAiRunCancelled,
  removeIsolatedThreadWorkspace,
  runAiPrompt,
  setAiRunHost,
} from "./runner";

function shellProvider(script: string): AiProvider {
  return {
    id: "codex",
    name: "Codex",
    command: "sh",
    available: true,
    buildArgs: () => ["-c", script],
    buildStructuredArgs: () => ["-c", script],
  };
}

async function fakeAuthProvider(id: string, script: string): Promise<{ provider: AiProvider; tmpPath: string }> {
  const tmpPath = await mkdtemp(join(tmpdir(), "gloomberb-auth-check-"));
  const command = join(tmpPath, `${id}-auth`);
  await Bun.write(command, `#!/bin/sh\n${script}\n`);
  chmodSync(command, 0o755);
  return {
    tmpPath,
    provider: {
      id,
      name: id === "claude" ? "Claude" : "Codex",
      command,
      available: true,
      authCheckArgs: ["auth", "status"],
      buildArgs: () => [],
    },
  };
}

describe("AI provider status checks", () => {
  test("caches auth status until an auth-classified run failure", async () => {
    const provider = shellProvider("unused");
    let checks = 0;
    setAiRunHost({
      checkStatus: async () => {
        checks += 1;
        return { available: true, authenticated: false, inconclusive: true, message: "Timed out" };
      },
      run: () => ({
        done: Promise.reject(new Error("Authentication required")),
        cancel: () => {},
      }),
    });

    try {
      await checkAiProviderStatus(provider);
      await checkAiProviderStatus(provider);
      expect(checks).toBe(1);
      await runAiPrompt({ provider, prompt: "ignored" }).done.catch(() => {});
      await checkAiProviderStatus(provider);
      expect(checks).toBe(2);
    } finally {
      setAiRunHost(null);
    }
  });

  test("marks a timed-out auth check as inconclusive", async () => {
    const { provider, tmpPath } = await fakeAuthProvider("codex", "exec sleep 1");
    try {
      const result = await checkStatusWithBun(provider, 50);
      expect(result).toMatchObject({ available: true, authenticated: false, inconclusive: true });
      expect(result.message).toBeTruthy();
    } finally {
      await rm(tmpPath, { recursive: true, force: true });
    }
  });

  test("keeps a confirmed unauthenticated check conclusive", async () => {
    const { provider, tmpPath } = await fakeAuthProvider("codex", "exit 1");
    try {
      const result = await checkStatusWithBun(provider, 500);
      expect(result.available).toBe(true);
      expect(result.authenticated).toBe(false);
      expect(result.inconclusive).toBeFalsy();
    } finally {
      await rm(tmpPath, { recursive: true, force: true });
    }
  });

  test("accepts Claude's authenticated JSON status", async () => {
    const { provider, tmpPath } = await fakeAuthProvider("claude", `printf '%s\\n' '{"loggedIn":true}'`);
    try {
      const result = await checkStatusWithBun(provider, 500);
      expect(result.authenticated).toBe(true);
      expect(result.inconclusive).toBeFalsy();
    } finally {
      await rm(tmpPath, { recursive: true, force: true });
    }
  });
});

describe("AI runner structured mode", () => {
  test("delivers structured output as deltas", async () => {
    const chunks: string[] = [];
    const provider = {
      ...shellProvider(`
        printf '%s\n' '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"First"}}}'
        sleep 0.05
        printf '%s\n' '{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":" second"}}}'
        printf '%s\n' '{"type":"result","subtype":"success","session_id":"session-1","result":"First second"}'
      `),
      id: "claude",
    };

    const run = runAiPrompt({
      provider,
      prompt: "ignored",
      outputMode: "structured",
      onChunk: (output) => chunks.push(output),
    });

    expect(await run.done).toEqual({ output: "First second", sessionId: "session-1" });
    expect(chunks).toEqual(["First", " second"]);
  });

  test("delivers plain output as deltas", async () => {
    const chunks: string[] = [];
    const run = runAiPrompt({
      provider: shellProvider("printf First; sleep 0.05; printf second"),
      prompt: "ignored",
      onChunk: (delta) => chunks.push(delta),
    });

    expect(await run.done).toEqual({ output: "Firstsecond", sessionId: null });
    expect(chunks).toEqual(["First", "second"]);
  });

  test("cancellation takes precedence over process exit errors", async () => {
    const run = runAiPrompt({
      provider: shellProvider("sleep 5; exit 7"),
      prompt: "ignored",
      outputMode: "structured",
    });
    run.cancel();

    let caught: unknown;
    try {
      await run.done;
    } catch (error) {
      caught = error;
    }
    expect(isAiRunCancelled(caught)).toBe(true);
  });

  test("reuses a caller-owned per-thread workspace without removing it", async () => {
    const cwd = await ensureIsolatedThreadWorkspace("runner-test-thread");
    const provider = shellProvider(`printf '{"type":"item.completed","item":{"id":"answer","type":"agent_message","text":"%s"}}\\n' "$PWD"`);
    const run = runAiPrompt({
      provider,
      prompt: "ignored",
      cwd,
      outputMode: "structured",
      isolatedWorkspace: true,
    });

    const result = await run.done;
    expect(result.output).toBe(await realpath(cwd));
    expect(await ensureIsolatedThreadWorkspace("runner-test-thread")).toBe(cwd);
    expect(existsSync(cwd)).toBe(true);
    await removeIsolatedThreadWorkspace("runner-test-thread");
    expect(existsSync(cwd)).toBe(false);
    const recoveredCwd = await ensureIsolatedThreadWorkspace("runner-test-thread");
    expect(recoveredCwd).toBe(cwd);
    await removeIsolatedThreadWorkspace("runner-test-thread");
  });

  test("selects turn-one args before resume args", async () => {
    const provider: AiProvider = {
      ...shellProvider("unused"),
      buildStructuredArgs: (prompt) => ["-c", `printf '%s\\n' '{"type":"item.completed","item":{"id":"answer","type":"agent_message","text":"first:${prompt}"}}'`],
      buildResumeArgs: (prompt, sessionId) => ["-c", `printf '%s\\n' '{"type":"item.completed","item":{"id":"answer","type":"agent_message","text":"resume:${sessionId}:${prompt}"}}'`],
    };

    const first = await runAiPrompt({ provider, prompt: "one", outputMode: "structured" }).done;
    const resumed = await runAiPrompt({ provider, prompt: "two", sessionId: "session-1", outputMode: "structured" }).done;

    expect(first.output).toBe("first:one");
    expect(resumed.output).toBe("resume:session-1:two");
  });

  test("forwards structured isolation and cancellation through a configured host", async () => {
    let received: Parameters<NonNullable<import("./runner").AiRunHost["run"]>>[0] | null = null;
    let cancelled = false;
    setAiRunHost({
      run(options) {
        received = options;
        return {
          done: Promise.resolve({ output: "host output", sessionId: "host-session" }),
          cancel: () => { cancelled = true; },
        };
      },
    });

    try {
      const run = runAiPrompt({
        provider: shellProvider("unused"),
        prompt: "selected context only",
        sessionId: "existing-session",
        outputMode: "structured",
        isolatedWorkspace: true,
      });
      run.cancel();
      expect(await run.done).toEqual({ output: "host output", sessionId: "host-session" });
      expect(received?.prompt).toBe("selected context only");
      expect(received?.sessionId).toBe("existing-session");
      expect(received?.outputMode).toBe("structured");
      expect(received?.isolatedWorkspace).toBe(true);
      expect(cancelled).toBe(true);
    } finally {
      setAiRunHost(null);
    }
  });
});
