import { homedir } from "os";
import { join } from "path";

interface AiCliPathOptions {
  env?: Record<string, string | undefined>;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

interface AiCliResolutionOptions extends AiCliPathOptions {
  which?: (command: string, options: { PATH: string }) => string | null;
  providerId?: string;
}

export interface ResolvedAiCliCommand {
  executable: string;
  env: Record<string, string | undefined>;
}

const PROVIDER_AUTH_ENV_KEYS: Record<string, readonly string[]> = {
  claude: ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
  codex: ["OPENAI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  // Pi's subscription and OAuth credentials live in its config directory. Its
  // selected model provider is not known at command-resolution time, so no
  // ambient cloud API keys are exposed to its tools.
  pi: [],
};

function providerIdFor(command: string, explicitProviderId?: string): string {
  if (explicitProviderId) return explicitProviderId;
  const basename = command.split(/[\\/]/).at(-1) ?? command;
  return basename.replace(/\.(?:cmd|exe)$/i, "");
}

export function buildAiCliEnv(
  command: string,
  searchPath: string,
  env: Record<string, string | undefined>,
  providerId?: string,
): Record<string, string | undefined> {
  const allowedKeys = new Set(["HOME", "LANG", "TERM"]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("LC_")) allowedKeys.add(key);
  }
  for (const key of PROVIDER_AUTH_ENV_KEYS[providerIdFor(command, providerId)] ?? []) {
    allowedKeys.add(key);
  }

  const childEnv: Record<string, string | undefined> = { PATH: searchPath };
  for (const key of allowedKeys) {
    if (env[key] !== undefined) childEnv[key] = env[key];
  }
  return childEnv;
}

export function getAiCliSearchPath({
  env = process.env,
  homeDir = env.HOME || homedir(),
  platform = process.platform,
}: AiCliPathOptions = {}): string {
  const delimiter = platform === "win32" ? ";" : ":";
  const entries = (env.PATH ?? "").split(delimiter).filter(Boolean);

  if (platform === "win32") {
    if (env.APPDATA) entries.push(join(env.APPDATA, "npm"));
  } else {
    entries.push(
      join(homeDir, ".local", "bin"),
      join(homeDir, ".bun", "bin"),
      join(homeDir, ".npm-global", "bin"),
    );

    if (platform === "darwin") {
      entries.push("/opt/homebrew/bin", "/usr/local/bin");
    } else if (platform === "linux") {
      entries.push("/home/linuxbrew/.linuxbrew/bin", "/usr/local/bin");
    }
  }

  return [...new Set(entries)].join(delimiter);
}

export function resolveAiCliCommand(
  command: string,
  options: AiCliResolutionOptions = {},
): ResolvedAiCliCommand | null {
  if (typeof Bun === "undefined" || typeof Bun.which !== "function") return null;

  const env = options.env ?? process.env;
  const searchPath = getAiCliSearchPath({ ...options, env });
  const executable = (options.which ?? Bun.which)(command, { PATH: searchPath });
  if (!executable) return null;

  return {
    executable,
    env: buildAiCliEnv(command, searchPath, env, options.providerId),
  };
}
