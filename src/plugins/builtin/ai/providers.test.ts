import { describe, expect, test } from "bun:test";
import { getAiProviderDefinitions, getAiToolSideEffectLevel, getLocalWorkspaceProviders } from "./providers";

describe("local workspace provider contracts", () => {
  test("keeps tools disabled while enabling persisted turn-one sessions", () => {
    const definitions = getAiProviderDefinitions();
    const claude = definitions.find((provider) => provider.id === "claude");
    const codex = definitions.find((provider) => provider.id === "codex");
    if (!claude?.buildStructuredArgs || !codex?.buildStructuredArgs) {
      throw new Error("Expected structured Claude and Codex definitions");
    }
    const claudeArgs = claude.buildStructuredArgs("PROMPT");
    const codexArgs = codex.buildStructuredArgs("PROMPT");

    expect(claudeArgs.slice(0, 2)).toEqual(["--print", "PROMPT"]);
    expect(claudeArgs).toContain("--safe-mode");
    expect(claudeArgs).not.toContain("--no-session-persistence");
    expect(claudeArgs).toContain("--tools");
    expect(codexArgs).not.toContain("--ephemeral");
    expect(codexArgs).toContain("--ignore-user-config");
    expect(codexArgs).toContain("--ignore-rules");
    expect(codexArgs).toContain("--disable");
    expect(codexArgs).toContain("shell_tool");
    expect(codexArgs).toContain("--json");
  });

  test("builds provider-specific resume arguments", () => {
    const definitions = getAiProviderDefinitions();
    const claude = definitions.find((provider) => provider.id === "claude");
    const codex = definitions.find((provider) => provider.id === "codex");
    const pi = definitions.find((provider) => provider.id === "pi");
    if (!claude?.buildResumeArgs || !codex?.buildResumeArgs || !pi?.buildResumeArgs) {
      throw new Error("Expected resume-enabled local providers");
    }

    const claudeArgs = claude.buildResumeArgs("PROMPT", "claude-session");
    expect(claudeArgs).toContain("--resume");
    expect(claudeArgs).toContain("claude-session");
    expect(claudeArgs).toContain("PROMPT");
    expect(claudeArgs).toContain("--tools");
    expect(claudeArgs).not.toContain("--no-session-persistence");
    const codexArgs = codex.buildResumeArgs("PROMPT", "codex-session");
    expect(codexArgs.slice(0, 4)).toEqual(["exec", "--sandbox", "read-only", "resume"]);
    expect(codexArgs.slice(-2)).toEqual(["codex-session", "PROMPT"]);
    expect(codexArgs).toContain("PROMPT");
    expect(codexArgs).toContain("--disable");
    expect(codexArgs).toContain("shell_tool");
    expect(codexArgs).toContain("--sandbox");
    expect(codexArgs).toContain("read-only");
    expect(codexArgs).not.toContain("--ephemeral");
    const piArgs = pi.buildResumeArgs("PROMPT", "pi-session");
    expect(piArgs).toContain("--session-id");
    expect(piArgs).toContain("pi-session");
    expect(piArgs).toContain("PROMPT");
    expect(piArgs).toContain("--no-tools");
    expect(piArgs).not.toContain("--no-session");
  });

  test("builds confined and YOLO tool arguments for every local provider", () => {
    const definitions = getAiProviderDefinitions();
    const claude = definitions.find((provider) => provider.id === "claude");
    const codex = definitions.find((provider) => provider.id === "codex");
    const pi = definitions.find((provider) => provider.id === "pi");
    if (!claude?.buildToolsArgs || !codex?.buildToolsArgs || !pi?.buildToolsArgs) {
      throw new Error("Expected tools-enabled local providers");
    }

    const claudeConfined = claude.buildToolsArgs("PROMPT", { mode: "confined" });
    expect(claudeConfined).toContain("Read,Write,Edit,Bash,Glob,Grep");
    expect(claudeConfined).toContain("dontAsk");
    expect(claudeConfined).not.toContain("--safe-mode");
    expect(claudeConfined).not.toContain("--dangerously-skip-permissions");
    const claudeSettings = JSON.parse(claudeConfined[claudeConfined.indexOf("--settings") + 1]!);
    expect(claudeSettings.sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
    });
    expect(claudeSettings.sandbox.filesystem).toEqual({
      allowWrite: ["."],
      denyRead: ["/"],
      allowRead: ["."],
    });
    expect(claudeSettings.sandbox.network.allowedDomains).toEqual([]);
    const claudeYolo = claude.buildToolsArgs("PROMPT", { mode: "yolo", sessionId: "session-1" });
    expect(claudeYolo).toContain("default");
    expect(claudeYolo).toContain("--dangerously-skip-permissions");
    expect(claudeYolo).toContain("session-1");
    expect(claudeYolo).not.toContain("--settings");

    const codexConfined = codex.buildToolsArgs("PROMPT", { mode: "confined" });
    expect(codexConfined.slice(codexConfined.indexOf("--sandbox"), codexConfined.indexOf("--sandbox") + 2))
      .toEqual(["--sandbox", "workspace-write"]);
    expect(codexConfined).not.toContain("shell_tool");
    const codexYolo = codex.buildToolsArgs("PROMPT", { mode: "yolo", sessionId: "session-2" });
    expect(codexYolo.slice(0, 4)).toEqual(["exec", "--sandbox", "danger-full-access", "resume"]);
    expect(codexYolo).toContain("session-2");
    expect(codexYolo).not.toContain("shell_tool");

    const piConfined = pi.buildToolsArgs("PROMPT", { mode: "confined" });
    expect(piConfined).toContain("read,grep,find,ls");
    expect(piConfined).toContain("--offline");
    expect(piConfined.join(" ")).not.toMatch(/\b(?:bash|edit|write)\b/);
    expect(piConfined).not.toContain("--no-tools");
    const piYolo = pi.buildToolsArgs("PROMPT", { mode: "yolo", sessionId: "session-3" });
    expect(piYolo).toContain("read,bash,edit,write,grep,find,ls");
    expect(piYolo).not.toContain("--offline");
    expect(piYolo).not.toContain("--no-tools");
    expect(piYolo).toContain("session-3");
  });

  test("maps tool posture onto the capability side-effect taxonomy", () => {
    expect(getAiToolSideEffectLevel("claude", "confined")).toBe("local-write");
    expect(getAiToolSideEffectLevel("codex", "confined")).toBe("local-write");
    expect(getAiToolSideEffectLevel("pi", "confined")).toBe("none");
    expect(getAiToolSideEffectLevel("pi", "yolo")).toBe("network-write");
  });

  test("defines Pi structured mode without an auth-status contract", () => {
    const definitions = getAiProviderDefinitions();
    const pi = definitions.find((provider) => provider.id === "pi");
    if (!pi?.buildStructuredArgs) throw new Error("Expected a structured Pi definition");

    const args = pi.buildStructuredArgs("PROMPT");
    expect(pi.name).toBe("Pi");
    expect(pi.command).toBe("pi");
    expect(args).toContain("--mode");
    expect(args).toContain("json");
    expect(args).not.toContain("--no-session");
    expect(args.at(-1)).toBe("PROMPT");
    expect(pi.authCheckArgs).toBeUndefined();
  });

  test("includes Pi in the local workspace runtimes", () => {
    const providers = getAiProviderDefinitions().map((provider) => ({ ...provider, available: true }));

    expect(getLocalWorkspaceProviders(providers).map((provider) => provider.id)).toEqual(["claude", "codex", "pi"]);
  });
});
