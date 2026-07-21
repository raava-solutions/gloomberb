import {
  AI_RUNNER_CAPABILITY_ID,
  type AiRunnerEvent,
} from "../../../capabilities";
import {
  __setDetectedProvidersForTests,
  getAiProviderDefinitions,
} from "../../../plugins/builtin/ai/providers";
import { AiRunCancelledError, setAiRunHost } from "../../../plugins/builtin/ai/runner";
import { backendRequest, onCapabilityEvent } from "./backend-rpc";

let nextRunId = 1;

export async function installElectrobunAiHost(): Promise<void> {
  const availability = await backendRequest<Record<string, boolean>>("capability.invoke", {
    capabilityId: AI_RUNNER_CAPABILITY_ID,
    operationId: "getProviderAvailability",
    payload: {},
  });
  const providers = getAiProviderDefinitions().map((definition) => ({
    ...definition,
    available: availability[definition.id] ?? false,
  }));

  __setDetectedProvidersForTests(providers);
  setAiRunHost({
    ensureThreadWorkspace(threadId) {
      return backendRequest<string>("capability.invoke", {
        capabilityId: AI_RUNNER_CAPABILITY_ID,
        operationId: "ensureThreadWorkspace",
        payload: { threadId },
      });
    },
    async removeThreadWorkspace(threadId) {
      await backendRequest("capability.invoke", {
        capabilityId: AI_RUNNER_CAPABILITY_ID,
        operationId: "removeThreadWorkspace",
        payload: { threadId },
      });
    },
    checkStatus(provider) {
      return backendRequest("capability.invoke", {
        capabilityId: AI_RUNNER_CAPABILITY_ID,
        operationId: "checkProviderStatus",
        payload: { providerId: provider.id },
      });
    },
    run({ provider, prompt, sessionId, threadId, toolMode, cwd, onChunk, outputMode, isolatedWorkspace }) {
      const subscriptionId = `ai-run:${nextRunId++}`;
      let disposed = false;
      let settled = false;
      let accumulatedOutput = "";
      let disposeMessages: () => void = () => {};
      let resolveDone: (result: { output: string; sessionId: string | null }) => void = () => {};
      let rejectDone: (error: unknown) => void = () => {};

      const cleanup = () => {
        if (disposed) return;
        disposed = true;
        disposeMessages();
        void backendRequest("capability.unsubscribe", { subscriptionId }).catch(() => {});
      };

      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };

      const done = new Promise<{ output: string; sessionId: string | null }>((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
      });

      disposeMessages = onCapabilityEvent(subscriptionId, (message) => {
        const event = message.event as AiRunnerEvent;
        switch (event.kind) {
          case "chunk":
            accumulatedOutput += event.delta;
            onChunk?.(event.delta);
            break;
          case "done":
            settle(() => resolveDone({ output: event.output || accumulatedOutput, sessionId: event.sessionId }));
            break;
          case "cancelled":
            settle(() => rejectDone(new AiRunCancelledError()));
            break;
          case "error":
            settle(() => rejectDone(new Error(event.error)));
            break;
        }
      });

      const subscribePromise = backendRequest("capability.subscribe", {
        subscriptionId,
        capabilityId: AI_RUNNER_CAPABILITY_ID,
        operationId: "run",
        payload: {
          providerId: provider.id,
          prompt,
          sessionId,
          threadId,
          toolMode,
          cwd,
          outputMode,
          isolatedWorkspace,
        },
      }).catch((error) => {
        settle(() => rejectDone(error));
      }).finally(() => {
        // Cancellation can race the async subscribe. Unsubscribe again after it
        // settles so a late backend subscription cannot outlive this run.
        if (disposed) {
          void backendRequest("capability.unsubscribe", { subscriptionId }).catch(() => {});
        }
      });
      void subscribePromise;

      return {
        done,
        cancel() {
          settle(() => rejectDone(new AiRunCancelledError()));
        },
      };
    },
  });
}
