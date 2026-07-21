import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { getAiCliSearchPath, resolveAiCliCommand } from "./command-resolution";
import { __setDetectedProvidersForTests, detectProviders, getAiProvider } from "./providers";
import { runAiPrompt, setAiRunHost } from "./runner";

const originalHome = process.env.HOME;
const originalPath = process.env.PATH;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  process.env.HOME = originalHome;
  process.env.PATH = originalPath;
  __setDetectedProvidersForTests(null);
  setAiRunHost(null);
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("AI CLI command resolution", () => {
  test("augments a macOS GUI PATH with user-level and Homebrew bin directories", () => {
    const homeDir = "/Users/example";
    const searchPath = getAiCliSearchPath({
      env: { PATH: "/usr/bin:/bin" },
      homeDir,
      platform: "darwin",
    });

    expect(searchPath.split(":")).toEqual([
      "/usr/bin",
      "/bin",
      `${homeDir}/.local/bin`,
      `${homeDir}/.bun/bin`,
      `${homeDir}/.npm-global/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ]);
  });

  test("passes only runtime basics and the active provider's auth variables", () => {
    const resolved = resolveAiCliCommand("claude", {
      env: {
        PATH: "/usr/bin:/bin",
        HOME: "/Users/example",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        TERM: "xterm-256color",
        ANTHROPIC_API_KEY: "provider-secret",
        CLAUDE_CODE_OAUTH_TOKEN: "provider-oauth",
        OPENAI_API_KEY: "other-provider-secret",
        IBKR_BROKER_TOKEN: "broker-secret",
        AWS_SECRET_ACCESS_KEY: "cloud-secret",
      },
      homeDir: "/Users/example",
      platform: "darwin",
      providerId: "claude",
      which: () => "/Users/example/.local/bin/claude",
    });

    expect(resolved?.env).toEqual({
      PATH: "/usr/bin:/bin:/Users/example/.local/bin:/Users/example/.bun/bin:/Users/example/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin",
      HOME: "/Users/example",
      LANG: "en_US.UTF-8",
      TERM: "xterm-256color",
      LC_ALL: "en_US.UTF-8",
      ANTHROPIC_API_KEY: "provider-secret",
      CLAUDE_CODE_OAUTH_TOKEN: "provider-oauth",
    });
    expect(resolved?.env).not.toHaveProperty("IBKR_BROKER_TOKEN");
    expect(resolved?.env).not.toHaveProperty("AWS_SECRET_ACCESS_KEY");
    expect(resolved?.env).not.toHaveProperty("OPENAI_API_KEY");
  });

  test("uses the augmented PATH for both detection and execution", async () => {
    if (process.platform === "win32") return;

    const homeDir = await mkdtemp(join(tmpdir(), "gloomberb-ai-path-"));
    temporaryDirectories.push(homeDir);
    const binDir = join(homeDir, ".local", "bin");
    await mkdir(binDir, { recursive: true });
    await writeFile(join(binDir, "claude"), "#!/usr/bin/env fake-ai-runtime\n");
    await writeFile(
      join(binDir, "fake-ai-runtime"),
      "#!/bin/sh\nfor argument do prompt=\"$argument\"; done\nprintf 'resolved:%s' \"$prompt\"\n",
    );
    await chmod(join(binDir, "claude"), 0o755);
    await chmod(join(binDir, "fake-ai-runtime"), 0o755);

    process.env.HOME = homeDir;
    process.env.PATH = "/usr/bin:/bin";
    __setDetectedProvidersForTests(null);

    const provider = getAiProvider("claude", detectProviders());
    expect(provider?.available).toBe(true);
    expect(resolveAiCliCommand("claude")?.executable).toBe(join(binDir, "claude"));

    const run = runAiPrompt({ provider: provider!, prompt: "AAPL" });
    expect(await run.done).toEqual({ output: "resolved:AAPL", sessionId: null });
  });
});
