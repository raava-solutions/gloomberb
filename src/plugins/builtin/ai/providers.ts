import { resolveAiCliCommand } from "./command-resolution";
import { normalizeLocalAgentSessionId } from "./session-id";

export interface AiProvider {
  id: string;
  name: string;
  command: string;
  available: boolean;
  buildArgs: (prompt: string) => string[];
  buildStructuredArgs?: (prompt: string) => string[];
  buildResumeArgs?: (prompt: string, sessionId: string) => string[];
  buildToolsArgs?: (prompt: string, opts: { mode: AiToolMode; sessionId?: string }) => string[];
  authCheckArgs?: string[];
  authLoginCommand?: string;
}

export type AiToolMode = "confined" | "yolo";

export type AiToolSideEffectLevel = "none" | "local-write" | "network-write";

export function getAiToolSideEffectLevel(providerId: string, mode: AiToolMode): AiToolSideEffectLevel {
  if (mode === "yolo") return "network-write";
  return providerId === "pi" ? "none" : "local-write";
}

export interface AiProviderDefinition extends Omit<AiProvider, "available"> {}

const CLAUDE_CONFINED_SETTINGS = JSON.stringify({
  sandbox: {
    enabled: true,
    failIfUnavailable: true,
    autoAllowBashIfSandboxed: true,
    allowUnsandboxedCommands: false,
    filesystem: {
      allowWrite: ["."],
      denyRead: ["/"],
      allowRead: ["."],
    },
    network: {
      allowedDomains: [],
      allowAllUnixSockets: false,
      allowLocalBinding: false,
    },
  },
  permissions: {
    allow: ["Edit(./**)"],
  },
});

function claudeStructuredArgs(prompt: string, sessionId?: string): string[] {
  const normalizedSessionId = normalizeLocalAgentSessionId(sessionId);
  return [
    "--print",
    prompt,
    "--verbose",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--safe-mode",
    "--tools",
    "",
    "--permission-mode",
    "manual",
    ...(normalizedSessionId ? ["--resume", normalizedSessionId] : []),
  ];
}

function claudeToolsArgs(prompt: string, mode: AiToolMode, sessionId?: string): string[] {
  const base = claudeStructuredArgs(prompt, sessionId);
  const toolsIndex = base.indexOf("--tools");
  base.splice(toolsIndex, 2);
  const safeModeIndex = base.indexOf("--safe-mode");
  base.splice(safeModeIndex, 1);
  const permissionModeIndex = base.indexOf("--permission-mode");
  base.splice(permissionModeIndex, 2);
  if (mode === "yolo") {
    return [...base, "--tools", "default", "--dangerously-skip-permissions"];
  }
  return [
    ...base,
    "--tools",
    "Read,Write,Edit,Bash,Glob,Grep",
    "--permission-mode",
    "dontAsk",
    "--setting-sources",
    "",
    "--settings",
    CLAUDE_CONFINED_SETTINGS,
  ];
}

function codexStructuredArgs(prompt: string, sessionId?: string): string[] {
  const normalizedSessionId = normalizeLocalAgentSessionId(sessionId);
  return normalizedSessionId
    ? [
      "exec", "--sandbox", "read-only", "resume", "--skip-git-repo-check",
      "--ignore-user-config", "--ignore-rules", "--disable", "shell_tool", "--json",
      normalizedSessionId, prompt,
    ]
    : [
      "exec", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
      "--disable", "shell_tool", "--sandbox", "read-only", "--json", prompt,
    ];
}

function codexToolsArgs(prompt: string, mode: AiToolMode, sessionId?: string): string[] {
  const base = codexStructuredArgs(prompt, sessionId);
  const disableIndex = base.indexOf("--disable");
  base.splice(disableIndex, 2);
  const sandboxIndex = base.indexOf("--sandbox");
  base[sandboxIndex + 1] = mode === "yolo" ? "danger-full-access" : "workspace-write";
  if (mode === "confined") {
    base.splice(
      1,
      0,
      "-c", "sandbox_workspace_write.exclude_tmpdir_env_var=true",
      "-c", "sandbox_workspace_write.exclude_slash_tmp=true",
      "-c", "sandbox_workspace_write.network_access=false",
    );
  }
  return base;
}

function piStructuredArgs(prompt: string, sessionId?: string): string[] {
  const normalizedSessionId = normalizeLocalAgentSessionId(sessionId);
  return [
    "-p", "--mode", "json", "--offline", "--no-tools", "-nc", "-ne", "-ns",
    ...(normalizedSessionId ? ["--session-id", normalizedSessionId] : []), prompt,
  ];
}

function piToolsArgs(prompt: string, mode: AiToolMode, sessionId?: string): string[] {
  const base = piStructuredArgs(prompt, sessionId);
  const noToolsIndex = base.indexOf("--no-tools");
  base.splice(noToolsIndex, 1);
  const offlineIndex = base.indexOf("--offline");
  if (mode === "yolo") base.splice(offlineIndex, 1);
  const tools = mode === "yolo"
    ? "read,bash,edit,write,grep,find,ls"
    : "read,grep,find,ls";
  base.splice(base.length - 1, 0, "--tools", tools);
  return base;
}

const PROVIDER_DEFS: AiProviderDefinition[] = [
  {
    id: "claude",
    name: "Claude",
    command: "claude",
    buildArgs: (prompt) => ["-p", prompt],
    buildStructuredArgs: (prompt) => claudeStructuredArgs(prompt),
    buildResumeArgs: (prompt, sessionId) => claudeStructuredArgs(prompt, sessionId),
    buildToolsArgs: (prompt, { mode, sessionId }) => claudeToolsArgs(prompt, mode, sessionId),
    authCheckArgs: ["auth", "status"],
    authLoginCommand: "claude auth login",
  },
  {
    id: "gemini",
    name: "Gemini",
    command: "gemini",
    buildArgs: (prompt) => ["-p", prompt],
  },
  {
    id: "codex",
    name: "Codex",
    command: "codex",
    buildArgs: (prompt) => ["exec", "--skip-git-repo-check", prompt],
    buildStructuredArgs: (prompt) => codexStructuredArgs(prompt),
    buildResumeArgs: (prompt, sessionId) => codexStructuredArgs(prompt, sessionId),
    buildToolsArgs: (prompt, { mode, sessionId }) => codexToolsArgs(prompt, mode, sessionId),
    authCheckArgs: ["login", "status"],
    authLoginCommand: "codex login",
  },
  {
    id: "pi",
    name: "Pi",
    command: "pi",
    buildArgs: (prompt) => ["-p", "--mode", "text", "--offline", "--no-tools", "--no-session", "-nc", "-ne", "-ns", prompt],
    buildStructuredArgs: (prompt) => piStructuredArgs(prompt),
    buildResumeArgs: (prompt, sessionId) => piStructuredArgs(prompt, sessionId),
    buildToolsArgs: (prompt, { mode, sessionId }) => piToolsArgs(prompt, mode, sessionId),
    // No authCheckArgs: pi authenticates via config/env (no auth-status subcommand);
    // an inconclusive/unauthenticated state surfaces at run time.
  },
];

let detectedProviders: AiProvider[] | null = null;

function commandExists(command: string): boolean {
  try {
    return resolveAiCliCommand(command) !== null;
  } catch {
    return false;
  }
}

export function detectProviders(): AiProvider[] {
  if (detectedProviders) return detectedProviders;

  detectedProviders = PROVIDER_DEFS.map((definition) => ({
    ...definition,
    available: commandExists(definition.command),
  }));
  return detectedProviders;
}

export function getAvailableProviders(providers = detectProviders()): AiProvider[] {
  return providers.filter((provider) => provider.available);
}

export function getLocalWorkspaceProviders(providers = detectProviders()): AiProvider[] {
  return providers.filter((provider) => provider.id === "claude" || provider.id === "codex" || provider.id === "pi");
}

export function getAiProvider(providerId: string | null | undefined, providers = detectProviders()): AiProvider | null {
  if (!providerId) return null;
  return providers.find((provider) => provider.id === providerId) ?? null;
}

export function resolveDefaultAiProviderId(providers = detectProviders()): string {
  return getAvailableProviders(providers)[0]?.id ?? providers[0]?.id ?? "claude";
}

export function __setDetectedProvidersForTests(providers: AiProvider[] | null): void {
  detectedProviders = providers;
}

export function getAiProviderDefinitions(): AiProviderDefinition[] {
  return PROVIDER_DEFS.map((definition) => ({ ...definition }));
}
