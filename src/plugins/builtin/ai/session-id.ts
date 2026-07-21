const LOCAL_AGENT_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export function normalizeLocalAgentSessionId(value: unknown): string | undefined {
  return typeof value === "string"
    && !value.startsWith("-")
    && LOCAL_AGENT_SESSION_ID_PATTERN.test(value)
    ? value
    : undefined;
}
