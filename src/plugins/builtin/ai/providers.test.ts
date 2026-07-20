import { describe, expect, test } from "bun:test";
import { getAiProviderDefinitions } from "./providers";

describe("local workspace provider contracts", () => {
  test("uses supported isolated structured modes for Claude and Codex", () => {
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
    expect(claudeArgs).toContain("--no-session-persistence");
    expect(codexArgs).toContain("--ephemeral");
    expect(codexArgs).toContain("--ignore-user-config");
    expect(codexArgs).toContain("--ignore-rules");
    expect(codexArgs).toContain("--disable");
    expect(codexArgs).toContain("shell_tool");
    expect(codexArgs).toContain("--json");
  });
});
