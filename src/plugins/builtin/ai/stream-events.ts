interface StructuredEventResult {
  transcript: string;
  terminalError: string | null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function contentText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => stringValue(objectValue(entry)?.text) ?? "")
    .filter(Boolean)
    .join("");
}

export class AiStructuredStreamParser {
  private buffer = "";
  private claudeTranscript = "";
  private claudeSawDeltas = false;
  private piTranscript = "";
  private piSawDeltas = false;
  private readonly codexItems = new Map<string, string>();
  private readonly codexItemOrder: string[] = [];
  private readonly completedCodexItems = new Set<string>();
  private terminalError: string | null = null;
  private cliSessionId: string | null = null;
  private pendingDelta = "";

  constructor(private readonly providerId: string) {}

  push(chunk: string): StructuredEventResult {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.parseLine(line);
    return this.result();
  }

  finish(): StructuredEventResult {
    if (this.buffer.trim()) this.parseLine(this.buffer);
    this.buffer = "";
    return this.result();
  }

  sessionId(): string | null {
    return this.cliSessionId;
  }

  takeDelta(): string {
    const delta = this.pendingDelta;
    this.pendingDelta = "";
    return delta;
  }

  private parseLine(line: string): void {
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      const label = this.providerId === "claude"
        ? "Claude"
        : this.providerId === "codex"
          ? "Codex"
          : this.providerId === "pi"
            ? "Pi"
            : this.providerId;
      throw new Error(`${label} returned malformed structured output.`);
    }
    const event = objectValue(parsed);
    if (!event) return;
    if (this.providerId === "claude") this.parseClaude(event);
    if (this.providerId === "codex") this.parseCodex(event);
    if (this.providerId === "pi") this.parsePi(event);
  }

  private parseClaude(event: Record<string, unknown>): void {
    this.cliSessionId ??= stringValue(event.session_id);
    const nestedEvent = event.type === "stream_event" ? objectValue(event.event) : event;
    const delta = nestedEvent?.type === "content_block_delta" ? objectValue(nestedEvent.delta) : null;
    if (delta?.type === "text_delta") {
      this.claudeSawDeltas = true;
      const text = stringValue(delta.text) ?? "";
      this.claudeTranscript += text;
      this.pendingDelta += text;
      return;
    }

    if (event.type === "assistant" && !this.claudeSawDeltas) {
      const snapshot = contentText(objectValue(event.message)?.content);
      if (snapshot) {
        this.claudeTranscript = snapshot;
        this.pendingDelta += snapshot;
      }
      return;
    }

    if (event.type === "result") {
      const result = stringValue(event.result);
      if (event.is_error === true || event.subtype !== "success") {
        this.terminalError = result ?? "Claude failed to complete the request.";
      } else if (!this.claudeTranscript && result) {
        this.claudeTranscript = result;
        this.pendingDelta += result;
      }
    }
  }

  private parseCodex(event: Record<string, unknown>): void {
    if (event.type === "thread.started") {
      this.cliSessionId ??= stringValue(event.thread_id);
    }
    if (event.type === "error" || event.type === "turn.failed") {
      const error = objectValue(event.error);
      this.terminalError = stringValue(event.message)
        ?? stringValue(error?.message)
        ?? "Codex failed to complete the request.";
      return;
    }
    if (event.type !== "item.started" && event.type !== "item.updated" && event.type !== "item.completed") return;
    const item = objectValue(event.item);
    if (item?.type !== "agent_message") return;
    const id = stringValue(item.id) ?? `agent-message-${this.codexItemOrder.length}`;
    if (!this.codexItems.has(id)) this.codexItemOrder.push(id);
    const text = stringValue(item.text) ?? "";
    this.codexItems.set(id, text);
    if (event.type === "item.completed" && !this.completedCodexItems.has(id) && text) {
      this.pendingDelta += `${this.completedCodexItems.size > 0 ? "\n\n" : ""}${text}`;
      this.completedCodexItems.add(id);
    }
  }

  private parsePi(event: Record<string, unknown>): void {
    if (event.type === "session") {
      this.cliSessionId ??= stringValue(event.id) ?? stringValue(event.sessionId) ?? stringValue(event.session_id);
    }
    if (event.type === "message_update") {
      const assistantMessageEvent = objectValue(event.assistantMessageEvent);
      if (assistantMessageEvent?.type === "text_delta") {
        this.piSawDeltas = true;
        const text = stringValue(assistantMessageEvent.delta) ?? "";
        this.piTranscript += text;
        this.pendingDelta += text;
      }
      return;
    }
    if (event.type === "message_end" && !this.piSawDeltas) {
      const message = objectValue(event.message);
      if (message?.role === "assistant") {
        const snapshot = contentText(message.content);
        if (snapshot) {
          this.piTranscript = snapshot;
          this.pendingDelta += snapshot;
        }
      }
      return;
    }
    if (event.type === "error") {
      this.terminalError = stringValue(event.message) ?? "Pi failed to complete the request.";
    }
  }

  private result(): StructuredEventResult {
    let transcript: string;
    if (this.providerId === "codex") {
      transcript = this.codexItemOrder.map((id) => this.codexItems.get(id) ?? "").filter(Boolean).join("\n\n");
    } else if (this.providerId === "pi") {
      transcript = this.piTranscript;
    } else {
      transcript = this.claudeTranscript;
    }
    return { transcript, terminalError: this.terminalError };
  }
}
