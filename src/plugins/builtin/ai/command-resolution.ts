import { homedir } from "os";
import { join } from "path";

interface AiCliPathOptions {
  env?: Record<string, string | undefined>;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

interface AiCliResolutionOptions extends AiCliPathOptions {
  which?: (command: string, options: { PATH: string }) => string | null;
}

export interface ResolvedAiCliCommand {
  executable: string;
  env: Record<string, string | undefined>;
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
    env: { ...env, PATH: searchPath },
  };
}
