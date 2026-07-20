---
date: 2026-07-20
topic: local-agent-workspace
---

# Local Agent Workspace Requirements

## Summary

Gloomberb will add a local AI workspace for finance research and portfolio reasoning. Each thread binds to the user's locally authenticated Codex or Claude Code runtime, while Gloomberb controls transcript rendering, deliberate finance-context attachment, and local persistence.

---

## Problem Frame

Today, a user switches among Gloomberb, an agent client, and other tools to combine market data, portfolio context, and agent reasoning. This loses terminal context and makes it hard to tell which agent received which information.

---

## Key Decisions

- **Local runtime ownership.** Codex and Claude Code retain their first-party OAuth sessions and subscription billing. Gloomberb must not store, proxy, or synchronize consumer subscription credentials.
- **Thread-bound identity.** A conversation selects one agent at creation and retains that identity. Changing agents starts a new thread rather than silently mixing authority or transcripts.
- **Explicit context sharing.** The user chooses which Gloomberb context reaches an agent. No portfolio, ticker, market, or account context is sent automatically.
- **Local-first privacy.** Thread history and attachment metadata remain on the device. Only a submitted prompt and its selected attachments go to the chosen local runtime.
- **Separate human and AI chat.** Existing Gloom Cloud channels and DMs remain a social surface. AI threads are a distinct workspace.

---

## Actors

- A1. **Gloomberb user** creates threads, chooses an agent, attaches context, and reads or interrupts streamed responses.
- A2. **Local Codex runtime** uses the user's existing ChatGPT/Codex authentication and performs a thread's inference.
- A3. **Local Claude Code runtime** uses the user's existing Claude authentication and performs a thread's inference.

---

## Requirements

**AI workspace and agent selection**

- R1. Gloomberb provides a dedicated AI workspace that does not alter existing human chat channels or DMs.
- R2. A user can start a thread by selecting an available Codex or Claude Code runtime.
- R3. Every thread visibly identifies its selected runtime for its entire lifetime.
- R4. If a selected runtime is unavailable or unauthenticated, Gloomberb explains the local prerequisite without requesting, retaining, or forwarding a subscription credential.
- R5. Gloomberb renders incremental agent output, completion, cancellation, and actionable runtime failures in the AI workspace.

**Context and privacy**

- R6. A user can deliberately attach relevant Gloomberb context to a prompt before it is sent.
- R7. Gloomberb previews selected context before submission and never automatically includes portfolio, account, ticker, or market context.
- R8. Gloomberb persists threads and their attachment metadata locally only.

**Conversation behavior**

- R9. A thread preserves ordered user and agent messages for later local review.
- R10. Selecting a different runtime creates a new thread and preserves the original thread unchanged.
- R11. The workspace supports the MVP research workflow without automatic routing, provider fallback, or agent-to-agent delegation.

---

## Key Flows

- F1. Start a local-agent thread
  - **Trigger:** A1 opens the AI workspace and chooses Codex or Claude Code.
  - **Actors:** A1, A2 or A3.
  - **Outcome:** Gloomberb verifies local availability, creates a locally persisted thread, and shows its bound agent identity.

- F2. Send a context-aware request
  - **Trigger:** A1 composes a prompt and chooses context to attach.
  - **Actors:** A1, A2 or A3.
  - **Outcome:** Gloomberb shows the attachment set before submission, sends only the prompt and approved context to the bound runtime, and renders streamed output.

- F3. Recover from a local runtime failure
  - **Trigger:** The selected runtime cannot start, lacks authentication, exits, or returns malformed output.
  - **Actors:** A1, A2 or A3.
  - **Outcome:** Gloomberb keeps the thread and unsent input intact, surfaces a local remediation path, and does not expose credentials.

---

## Acceptance Examples

- AE1. **Covers R2–R5.** Given authenticated Codex and Claude Code runtimes are available, when the user creates a Codex thread, then the thread displays Codex identity and streams only Codex output.
- AE2. **Covers R6–R7.** Given a user has a selected ticker and a local portfolio, when they submit a prompt without attachments, then neither context is sent; when they explicitly attach ticker context, the preview and outbound request include only that context.
- AE3. **Covers R4.** Given a selected runtime is not installed or not authenticated, when the user starts a thread, then Gloomberb shows the unmet local prerequisite and never prompts for a provider token.
- AE4. **Covers R8–R10.** Given a user has a completed Claude Code thread, when they start a Codex thread, then the original transcript remains local and unchanged.

---

## Scope Boundaries

- Hermes and other bring-your-own remote-agent connectors are deferred until the local Codex/Claude workflow proves useful.
- Direct provider OAuth, Vercel AI Gateway inference, provider fallback, automatic routing, cross-device sync, and shared cloud transcripts are out of scope for the MVP.
- Gloomberb does not become a general agent platform or modify its existing human-chat behavior.

---

## Dependencies / Assumptions

- The user's machine has a supported, locally authenticated Codex or Claude Code runtime.
- The MVP uses documented non-interactive, structured-output runtime surfaces rather than scraping interactive terminal UIs.
- Gloomberb's existing AI plugin already detects local providers, runs one-shot prompts, and prepares deliberate ticker context; the MVP extends that capability into durable threads rather than adding a parallel runtime.
- Claude consumer-subscription credentials remain local because Anthropic guidance restricts third-party credential proxying.

---

## Sources / Research

- `src/plugins/builtin/chat/` and `src/api-client/chat.ts` establish the existing human-chat boundary.
- `PLUGINS.md` defines Gloomberb's renderer-neutral plugin contract.
- [OpenAI Codex authentication](https://developers.openai.com/codex/auth) documents ChatGPT OAuth for Codex clients.
- [Claude Code authentication](https://docs.anthropic.com/en/docs/claude-code/iam) documents Claude subscription authentication for Claude Code.
- [Claude Code legal and compliance](https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance) informs the no-credential-proxy boundary.
