import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import type { AiProvider } from "./providers";
import { isAiRunCancelled, runAiPrompt, setAiRunHost } from "./runner";

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

describe("AI runner structured mode", () => {
  test("converts JSONL events into cumulative display transcript", async () => {
    const chunks: string[] = [];
    const provider = shellProvider(`
      printf '%s\n' '{"type":"item.completed","item":{"id":"reason","type":"reasoning","text":"hidden"}}'
      printf '%s\n' '{"type":"item.started","item":{"id":"answer","type":"agent_message","text":"Draft"}}'
      printf '%s\n' '{"type":"item.completed","item":{"id":"answer","type":"agent_message","text":"Final answer"}}'
    `);

    const run = runAiPrompt({
      provider,
      prompt: "ignored",
      outputMode: "structured",
      onChunk: (output) => chunks.push(output),
    });

    expect(await run.done).toBe("Final answer");
    expect(chunks.at(-1)).toBe("Final answer");
    expect(chunks.join(" ")).not.toContain("hidden");
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

  test("uses and removes an empty temporary cwd for isolated workspace runs", async () => {
    const provider = shellProvider(`printf '{"type":"item.completed","item":{"id":"answer","type":"agent_message","text":"%s"}}\\n' "$PWD"`);
    const run = runAiPrompt({
      provider,
      prompt: "ignored",
      outputMode: "structured",
      isolatedWorkspace: true,
    });

    const isolatedPath = await run.done;
    expect(isolatedPath).toContain("gloomberb-local-agent-");
    expect(existsSync(isolatedPath)).toBe(false);
  });

  test("forwards structured isolation and cancellation through a configured host", async () => {
    let received: Parameters<NonNullable<import("./runner").AiRunHost["run"]>>[0] | null = null;
    let cancelled = false;
    setAiRunHost({
      run(options) {
        received = options;
        return {
          done: Promise.resolve("host output"),
          cancel: () => { cancelled = true; },
        };
      },
    });

    try {
      const run = runAiPrompt({
        provider: shellProvider("unused"),
        prompt: "selected context only",
        outputMode: "structured",
        isolatedWorkspace: true,
      });
      run.cancel();
      expect(await run.done).toBe("host output");
      expect(received?.prompt).toBe("selected context only");
      expect(received?.outputMode).toBe("structured");
      expect(received?.isolatedWorkspace).toBe(true);
      expect(cancelled).toBe(true);
    } finally {
      setAiRunHost(null);
    }
  });
});
