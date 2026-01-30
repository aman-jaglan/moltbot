/**
 * Marlo event listener - subscribes to Moltbot agent events and forwards to Marlo.
 *
 * This captures intermediate steps like tool calls, LLM responses, and reasoning
 * without modifying the core agent code.
 */

import { onAgentEvent, type AgentEventPayload } from "../infra/agent-events.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getMarloClient } from "./client.js";
import { logLLMCall, logToolCall, hasActiveTrajectory } from "./trajectory.js";

const log = createSubsystemLogger("marlo/events");

// Track tool call start times for duration calculation
const toolStartTimes = new Map<string, number>();

// Track tool call inputs by toolCallId (to pair with results)
const toolInputsById = new Map<string, unknown>();

// Track which session a runId belongs to
const runIdToSession = new Map<string, string>();

// Track last emitted LLM text per session to deduplicate streaming chunks
const lastLLMTextBySession = new Map<string, string>();

// Debounce timer for LLM calls to only emit the final chunk
const llmDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const llmPendingData = new Map<string, { text: string; model?: string; provider?: string }>();

// Debounce delay in ms - wait for streaming to settle before emitting
const LLM_DEBOUNCE_MS = 100;

/**
 * Handle an agent event and forward relevant data to Marlo.
 */
function handleAgentEvent(event: AgentEventPayload): void {
  const client = getMarloClient();
  if (!client) return;

  const { runId, stream, data, sessionKey } = event;

  // Track runId -> sessionKey mapping
  if (sessionKey) {
    runIdToSession.set(runId, sessionKey);
  }

  const resolvedSessionKey = sessionKey ?? runIdToSession.get(runId);
  if (!resolvedSessionKey) {
    return; // Can't track without session
  }

  // Only capture if we have an active trajectory for this session
  if (!hasActiveTrajectory(resolvedSessionKey)) {
    return;
  }

  switch (stream) {
    case "tool":
      handleToolEvent(resolvedSessionKey, data);
      break;
    case "assistant":
      handleAssistantEvent(resolvedSessionKey, data);
      break;
    case "lifecycle":
      handleLifecycleEvent(runId, resolvedSessionKey, data);
      break;
  }
}

/**
 * Handle tool events (start, result, error).
 */
function handleToolEvent(sessionKey: string, data: Record<string, unknown>): void {
  const phase = data.phase as string;
  const toolName = data.name as string;
  const toolCallId = data.toolCallId as string;

  if (!toolName) return;

  if (phase === "start") {
    // Record start time for duration calculation
    if (toolCallId) {
      toolStartTimes.set(toolCallId, Date.now());
      // Store the input args to pair with result later
      toolInputsById.set(toolCallId, data.args ?? {});
    }

    log.debug(`Tool started: ${toolName}`);
  } else if (phase === "result" || phase === "end" || phase === "error") {
    // Calculate duration
    let durationMs: number | undefined;
    if (toolCallId && toolStartTimes.has(toolCallId)) {
      durationMs = Date.now() - toolStartTimes.get(toolCallId)!;
      toolStartTimes.delete(toolCallId);
    }

    // Get the original input args
    const toolInput = toolCallId
      ? (toolInputsById.get(toolCallId) ?? data.args ?? {})
      : (data.args ?? {});
    if (toolCallId) {
      toolInputsById.delete(toolCallId);
    }

    const isError = phase === "error" || data.isError === true;

    // Log complete tool call (with input, output, and duration)
    logToolCall({
      sessionKey,
      toolName,
      toolInput,
      toolOutput: !isError ? data.result : undefined,
      error: isError
        ? typeof data.error === "string"
          ? data.error
          : typeof data.result === "string"
            ? data.result
            : "Unknown error"
        : undefined,
      durationMs,
    });

    log.debug(`Tool ${phase}: ${toolName} (${durationMs ?? "?"}ms)`);
  }
}

/**
 * Handle assistant events (text output, thinking, usage).
 * Uses debouncing to only emit the final streamed text, not every chunk.
 */
function handleAssistantEvent(sessionKey: string, data: Record<string, unknown>): void {
  const text = data.text as string | undefined;
  const thinking = data.thinking as string | undefined;
  const model = (data.model as string) ?? undefined;
  const provider = (data.provider as string) ?? undefined;
  const usage = data.usage as
    | { inputTokens?: number; outputTokens?: number; cacheRead?: number; cacheWrite?: number }
    | undefined;

  // Handle usage data separately (emitted at end of run)
  if (usage && (usage.inputTokens || usage.outputTokens)) {
    logLLMCall({
      sessionKey,
      messages: [],
      model,
      provider,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    });
    log.debug(`Usage captured: ${usage.inputTokens} in, ${usage.outputTokens} out`);
    return;
  }

  // Only process if there's meaningful content
  if (!text && !thinking) return;

  // For thinking/reasoning, log immediately (these are typically not streamed in chunks)
  if (thinking && !text) {
    logLLMCall({
      sessionKey,
      messages: [],
      model,
      provider,
      reasoning: { thinking },
    });
    log.debug(`Assistant reasoning captured: ${thinking.slice(0, 50)}...`);
    return;
  }

  // For text responses, use debouncing to only capture the final chunk
  // This prevents logging every streaming delta as a separate event
  if (text) {
    const lastText = lastLLMTextBySession.get(sessionKey) ?? "";

    // Skip if this is a substring of what we already have (backward delta)
    if (lastText.startsWith(text)) {
      return;
    }

    // Update pending data with the latest (longest) text
    llmPendingData.set(sessionKey, { text, model, provider });
    lastLLMTextBySession.set(sessionKey, text);

    // Clear existing debounce timer
    const existingTimer = llmDebounceTimers.get(sessionKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer - will emit after streaming settles
    const timer = setTimeout(() => {
      const pending = llmPendingData.get(sessionKey);
      if (pending) {
        logLLMCall({
          sessionKey,
          messages: [],
          model: pending.model,
          provider: pending.provider,
          response: { text: pending.text },
        });
        log.debug(`Assistant response captured: ${pending.text.slice(0, 50)}...`);
        llmPendingData.delete(sessionKey);
      }
      llmDebounceTimers.delete(sessionKey);
    }, LLM_DEBOUNCE_MS);

    llmDebounceTimers.set(sessionKey, timer);
  }
}

/**
 * Handle lifecycle events (start, end, error).
 */
function handleLifecycleEvent(
  runId: string,
  sessionKey: string,
  data: Record<string, unknown>,
): void {
  const phase = data.phase as string;

  if (phase === "end") {
    // Clean up runId mapping
    runIdToSession.delete(runId);
  }

  // Lifecycle events are already captured by startMessageCapture/endMessageCapture
  // We just use this for cleanup
}

// Unsubscribe function
let unsubscribe: (() => void) | null = null;

/**
 * Start listening to agent events.
 * Call this during Marlo initialization.
 */
export function startEventListener(): void {
  if (unsubscribe) {
    log.debug("Event listener already running");
    return;
  }

  unsubscribe = onAgentEvent(handleAgentEvent);
  log.info("Started agent event listener for trajectory capture");
}

/**
 * Stop listening to agent events.
 * Call this during Marlo shutdown.
 */
export function stopEventListener(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
    toolStartTimes.clear();
    toolInputsById.clear();
    runIdToSession.clear();
    lastLLMTextBySession.clear();
    // Clear all debounce timers
    for (const timer of llmDebounceTimers.values()) {
      clearTimeout(timer);
    }
    llmDebounceTimers.clear();
    llmPendingData.clear();
    log.info("Stopped agent event listener");
  }
}

/**
 * Flush any pending debounced LLM calls for a session.
 * Call this when a trajectory ends to ensure all events are captured.
 */
export function flushPendingLLMEvents(sessionKey: string): void {
  const timer = llmDebounceTimers.get(sessionKey);
  if (timer) {
    clearTimeout(timer);
    llmDebounceTimers.delete(sessionKey);
  }

  const pending = llmPendingData.get(sessionKey);
  if (pending) {
    logLLMCall({
      sessionKey,
      messages: [],
      model: pending.model,
      provider: pending.provider,
      response: { text: pending.text },
    });
    llmPendingData.delete(sessionKey);
  }

  // Clear tracking for this session
  lastLLMTextBySession.delete(sessionKey);
}
