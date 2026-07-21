import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAiCliCommand } from "./command-resolution";
import type { AiProvider } from "./providers";
import { AiStructuredStreamParser } from "./stream-events";

const AUTH_CHECK_TIMEOUT_MS = 15_000;

export class AiRunCancelledError extends Error {
  constructor() {
    super("AI run cancelled");
    this.name = "AiRunCancelledError";
  }
}

export interface AiRunController {
  done: Promise<AiRunResult>;
  cancel: () => void;
}

export interface AiRunResult {
  output: string;
  sessionId: string | null;
}

export interface AiRunHost {
  run(options: {
    provider: AiProvider;
    prompt: string;
    sessionId?: string;
    cwd?: string;
    onChunk?: (delta: string) => void;
    outputMode?: "plain" | "structured";
    isolatedWorkspace?: boolean;
  }): AiRunController;
  checkStatus?(provider: AiProvider): Promise<AiProviderStatus>;
  ensureThreadWorkspace?(threadId: string): Promise<string>;
  removeThreadWorkspace?(threadId: string): Promise<void>;
}

export interface AiProviderStatus {
  available: boolean;
  authenticated: boolean;
  /** True when the check could not determine auth state, such as a timeout or spawn failure. */
  inconclusive?: boolean;
  message: string | null;
}

let configuredHost: AiRunHost | null = null;
const providerStatusCache = new Map<string, Promise<AiProviderStatus>>();
const isolatedThreadWorkspaces = new Map<string, Promise<string>>();
const AUTH_FAILURE_PATTERN = /not authenticated|authentication required|not logged in|login required|credential(?:s)? (?:expired|required)|refresh token/i;

export function setAiRunHost(host: AiRunHost | null): void {
  configuredHost = host;
  providerStatusCache.clear();
}

export function isAiRunCancelled(error: unknown): boolean {
  return error instanceof AiRunCancelledError;
}

function remediationFor(provider: AiProvider, reason: "unavailable" | "unauthenticated"): string {
  if (reason === "unavailable") {
    return `${provider.name} is not installed or not available in PATH.`;
  }
  const loginCommand = provider.authLoginCommand ?? provider.command;
  return `${provider.name} is installed but not authenticated. Run \`${loginCommand}\` in your terminal.`;
}

function sanitizeRuntimeError(value: string): string {
  return value
    .replace(/(bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/((?:access[_ -]?token|auth[_ -]?token|oauth[_ -]?token|claude_code_oauth_token|api[_ -]?key|authorization)["']?\s*[:=]\s*["']?)[^\s"']+/gi, "$1[redacted]")
    .trim()
    .slice(0, 2_000);
}

export async function checkStatusWithBun(
  provider: AiProvider,
  timeoutMs: number = AUTH_CHECK_TIMEOUT_MS,
): Promise<AiProviderStatus> {
  if (typeof Bun === "undefined" || typeof Bun.spawn !== "function") {
    return { available: false, authenticated: false, message: "Local AI status checks require a native Bun host." };
  }
  const resolvedCommand = resolveAiCliCommand(provider.command);
  if (!resolvedCommand) {
    return { available: false, authenticated: false, message: remediationFor(provider, "unavailable") };
  }
  if (!provider.authCheckArgs) {
    return { available: true, authenticated: true, message: null };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const proc = Bun.spawn([resolvedCommand.executable, ...provider.authCheckArgs], {
      env: resolvedCommand.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        try { proc.kill(); } catch { /* ignore cleanup failures */ }
        reject(new Error(`${provider.name} authentication check timed out.`));
      }, timeoutMs);
    });
    const exitCode = await Promise.race([proc.exited, timeout]);
    const statusText = await new Response(proc.stdout).text();
    const errorText = await new Response(proc.stderr).text();
    let authenticated = exitCode === 0;
    if (provider.id === "claude" && exitCode === 0) {
      try {
        // Claude's JSON includes account metadata. Read only this boolean and discard the payload.
        authenticated = JSON.parse(statusText)?.loggedIn === true;
      } catch {
        authenticated = false;
      }
    }
    if (authenticated) {
      return { available: true, authenticated: true, message: null };
    }
    const stderrSuffix = errorText.trim() ? ` (${sanitizeRuntimeError(errorText)})` : "";
    return {
      available: true,
      authenticated: false,
      message: `${remediationFor(provider, "unauthenticated")}${stderrSuffix}`,
    };
  } catch (error) {
    const fallbackMessage = `${provider.name} authentication check failed.`;
    return {
      available: true,
      authenticated: false,
      inconclusive: true,
      message: sanitizeRuntimeError(error instanceof Error ? error.message : fallbackMessage),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function checkAiProviderStatus(provider: AiProvider): Promise<AiProviderStatus> {
  const cached = providerStatusCache.get(provider.id);
  if (cached) return cached;
  const pending = configuredHost?.checkStatus?.(provider) ?? checkStatusWithBun(provider);
  providerStatusCache.set(provider.id, pending);
  void pending.then((status) => {
    if (!status.available || (!status.authenticated && !status.inconclusive)) {
      providerStatusCache.delete(provider.id);
    }
  }, () => {
    providerStatusCache.delete(provider.id);
  });
  return pending;
}

export function ensureIsolatedThreadWorkspace(threadId: string): Promise<string> {
  if (configuredHost?.ensureThreadWorkspace) return configuredHost.ensureThreadWorkspace(threadId);
  const existing = isolatedThreadWorkspaces.get(threadId);
  if (existing) return existing;
  const workspaceId = createHash("sha256").update(threadId).digest("hex");
  const path = join(tmpdir(), "gloomberb-local-agent-threads", workspaceId);
  const pending = mkdir(path, { recursive: true }).then(() => path);
  isolatedThreadWorkspaces.set(threadId, pending);
  void pending.catch(() => isolatedThreadWorkspaces.delete(threadId));
  return pending;
}

export async function removeIsolatedThreadWorkspace(threadId: string): Promise<void> {
  if (configuredHost?.removeThreadWorkspace) {
    await configuredHost.removeThreadWorkspace(threadId);
    return;
  }
  const pending = isolatedThreadWorkspaces.get(threadId);
  isolatedThreadWorkspaces.delete(threadId);
  if (!pending) return;
  const path = await pending.catch(() => null);
  if (path) await rm(path, { recursive: true, force: true }).catch(() => {});
}

function runWithBun({
  provider,
  prompt,
  sessionId,
  cwd,
  onChunk,
  outputMode = "plain",
  isolatedWorkspace = false,
}: {
  provider: AiProvider;
  prompt: string;
  sessionId?: string;
  cwd?: string;
  onChunk?: (delta: string) => void;
  outputMode?: "plain" | "structured";
  isolatedWorkspace?: boolean;
}): AiRunController {
  type BunSubprocess = ReturnType<typeof Bun.spawn>;
  if (typeof Bun === "undefined" || typeof Bun.spawn !== "function") {
    return {
      done: Promise.reject(new Error("AI execution requires a native Bun host.")),
      cancel: () => {},
    };
  }

  let cancelled = false;
  let processRef: BunSubprocess | null = null;

  const done = (async () => {
    if (cancelled) throw new AiRunCancelledError();
    const resolvedCommand = resolveAiCliCommand(provider.command);
    if (!resolvedCommand) {
      throw new Error(`${provider.name} is not installed or not available in PATH.`);
    }

    const args = outputMode === "structured"
      ? sessionId
        ? provider.buildResumeArgs?.(prompt, sessionId) ?? provider.buildStructuredArgs?.(prompt)
        : provider.buildStructuredArgs?.(prompt)
      : provider.buildArgs(prompt);
    if (!args) {
      throw new Error(`${provider.name} does not support structured non-interactive output.`);
    }

    const ownedIsolatedCwd = isolatedWorkspace && !cwd
      ? await mkdtemp(join(tmpdir(), "gloomberb-local-agent-"))
      : null;
    let proc: BunSubprocess | null = null;
    try {
      if (cancelled) throw new AiRunCancelledError();
      proc = Bun.spawn([resolvedCommand.executable, ...args], {
        cwd: ownedIsolatedCwd ?? cwd ?? (typeof process !== "undefined" ? process.cwd() : "."),
        env: resolvedCommand.env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      processRef = proc;

      const stderrPromise = new Response(proc.stderr).text().catch(() => "");
      const stdoutReader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let fullOutput = "";
      const structuredParser = outputMode === "structured"
        ? new AiStructuredStreamParser(provider.id)
        : null;

      while (true) {
        const { done: streamDone, value } = await stdoutReader.read();
        if (streamDone) break;
        if (cancelled) throw new AiRunCancelledError();
        const decoded = decoder.decode(value, { stream: true });
        if (structuredParser) {
          fullOutput = structuredParser.push(decoded).transcript;
          const delta = structuredParser.takeDelta();
          if (delta) onChunk?.(delta);
        } else {
          fullOutput += decoded;
          onChunk?.(decoded);
        }
      }

      const tail = decoder.decode();
      if (structuredParser && tail) {
        fullOutput = structuredParser.push(tail).transcript;
        const delta = structuredParser.takeDelta();
        if (delta) onChunk?.(delta);
      } else if (tail) {
        fullOutput += tail;
        onChunk?.(tail);
      }
      const structuredResult = structuredParser?.finish();
      if (structuredResult) {
        fullOutput = structuredResult.transcript;
        const delta = structuredParser?.takeDelta() ?? "";
        if (delta) onChunk?.(delta);
      }

      const exitCode = await proc.exited;
      const stderr = sanitizeRuntimeError(await stderrPromise);

      if (cancelled) throw new AiRunCancelledError();
      if (exitCode !== 0 || structuredResult?.terminalError) {
        const errorText = sanitizeRuntimeError(structuredResult?.terminalError || stderr || fullOutput);
        if (AUTH_FAILURE_PATTERN.test(errorText)) {
          providerStatusCache.delete(provider.id);
          throw new Error(remediationFor(provider, "unauthenticated"));
        }
        throw new Error(errorText || `${provider.name} exited with status ${exitCode}.`);
      }

      const finalOutput = fullOutput.trim();
      if (!finalOutput) {
        throw new Error(stderr || `${provider.name} returned an empty response.`);
      }

      return { output: finalOutput, sessionId: structuredParser?.sessionId() ?? sessionId ?? null };
    } catch (error) {
      try { proc?.kill(); } catch { /* ignore cleanup failures */ }
      await proc?.exited.catch(() => {});
      if (cancelled) throw new AiRunCancelledError();
      throw error;
    } finally {
      processRef = null;
      if (ownedIsolatedCwd) await rm(ownedIsolatedCwd, { recursive: true, force: true }).catch(() => {});
    }
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      try {
        processRef?.kill();
      } catch {
        // ignore cleanup failures
      }
    },
  };
}

export function runAiPrompt({
  provider,
  prompt,
  sessionId,
  cwd,
  onChunk,
  outputMode,
  isolatedWorkspace,
}: {
  provider: AiProvider;
  prompt: string;
  sessionId?: string;
  cwd?: string;
  onChunk?: (delta: string) => void;
  outputMode?: "plain" | "structured";
  isolatedWorkspace?: boolean;
}): AiRunController {
  const controller = (configuredHost ?? { run: runWithBun }).run({
    provider,
    prompt,
    sessionId,
    cwd,
    onChunk,
    outputMode,
    isolatedWorkspace,
  });
  return {
    ...controller,
    done: controller.done.catch((error) => {
      if (AUTH_FAILURE_PATTERN.test(error instanceof Error ? error.message : String(error))) {
        providerStatusCache.delete(provider.id);
      }
      throw error;
    }),
  };
}
