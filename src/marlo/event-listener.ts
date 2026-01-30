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

// Track which session a runId belongs to
const runIdToSession = new Map<string, string>();

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
 * Handle tool events (start, end, error).
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
    }

    // Log tool call start (input only)
    logToolCall({
      sessionKey,
      toolName,
      toolInput: data.args ?? {},
    });

    log.debug(`Tool started: ${toolName}`);
  } else if (phase === "end" || phase === "error") {
    // Calculate duration
    let durationMs: number | undefined;
    if (toolCallId && toolStartTimes.has(toolCallId)) {
      durationMs = Date.now() - toolStartTimes.get(toolCallId)!;
      toolStartTimes.delete(toolCallId);
    }

    // Log tool call end (with output/error)
    logToolCall({
      sessionKey,
      toolName,
      toolInput: data.args ?? {},
      toolOutput: phase === "end" ? data.result : undefined,
      error: phase === "error" ? String(data.error ?? "Unknown error") : undefined,
      durationMs,
    });

    log.debug(`Tool ${phase}: ${toolName} (${durationMs ?? "?"}ms)`);
  }
}

/**
 * Handle assistant events (text output, thinking).
 */
function handleAssistantEvent(sessionKey: string, data: Record<string, unknown>): void {
  const text = data.text as string | undefined;
  const thinking = data.thinking as string | undefined;

  // Only log if there's meaningful content
  if (!text && !thinking) return;

  // Log as LLM call with response
  logLLMCall({
    sessionKey,
    messages: [], // We don't have the full conversation here
    model: (data.model as string) ?? undefined,
    provider: (data.provider as string) ?? undefined,
    response: text ? { text } : undefined,
    reasoning: thinking ? { thinking } : undefined,
  });

  log.debug(`Assistant response: ${text?.slice(0, 50)}...`);
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
    runIdToSession.clear();
    log.info("Stopped agent event listener");
  }
}
