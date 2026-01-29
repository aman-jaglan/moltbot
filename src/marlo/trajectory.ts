/**
 * Trajectory capture and event management for Marlo integration.
 */

import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getMarloClient } from "./client.js";
import { BUFFER_SETTINGS, MOLTBOT_AGENT_ID } from "./constants.js";
import type {
  AgentDefinitionPayload,
  LLMCallPayload,
  TaskEndPayload,
  TaskStartPayload,
  ToolCallPayload,
  TrajectoryEvent,
  TrajectoryEventType,
} from "./types.js";

const log = createSubsystemLogger("marlo/trajectory");

/**
 * Active trajectory state for a session.
 */
interface ActiveTrajectory {
  runId: string;
  sessionKey: string;
  taskId: string;
  agentId: string;
  startedAt: number;
  events: TrajectoryEvent[];
}

// Event buffer for batched sending
let eventBuffer: TrajectoryEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

// Active trajectories by session key
const activeTrajectories = new Map<string, ActiveTrajectory>();

// Incrementing run ID for sessions
let runIdCounter = Date.now();

/**
 * Generate a unique run ID.
 */
function generateRunId(): number {
  return runIdCounter++;
}

/**
 * Generate a unique task ID.
 */
function generateTaskId(): string {
  return randomUUID();
}

/**
 * Generate a unique event ID.
 */
function generateEventId(): string {
  return randomUUID();
}

/**
 * Start a new trajectory for a task.
 */
export function startTrajectory(params: {
  sessionKey: string;
  task: string;
  channel?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}): ActiveTrajectory {
  const runId = generateRunId();
  const taskId = generateTaskId();
  const agentId = params.agentId ?? MOLTBOT_AGENT_ID;

  const trajectory: ActiveTrajectory = {
    runId: String(runId),
    sessionKey: params.sessionKey,
    taskId,
    agentId,
    startedAt: Date.now(),
    events: [],
  };

  activeTrajectories.set(params.sessionKey, trajectory);

  // Emit task_start event
  const event = createEvent(trajectory, "task_start", {
    task: params.task,
    metadata: {
      channel: params.channel,
      ...params.metadata,
    },
  } satisfies TaskStartPayload);

  bufferEvent(event);
  log.debug(`Started trajectory for session ${params.sessionKey}, task ${taskId}`);

  return trajectory;
}

/**
 * End the current trajectory for a session.
 */
export function endTrajectory(params: {
  sessionKey: string;
  status: "success" | "error" | "cancelled";
  finalAnswer?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}): void {
  const trajectory = activeTrajectories.get(params.sessionKey);
  if (!trajectory) {
    log.debug(`No active trajectory for session ${params.sessionKey}`);
    return;
  }

  // Emit task_end event
  const event = createEvent(trajectory, "task_end", {
    status: params.status,
    final_answer: params.finalAnswer,
    error: params.error,
    metadata: params.metadata,
  } satisfies TaskEndPayload);

  bufferEvent(event);
  activeTrajectories.delete(params.sessionKey);

  log.debug(`Ended trajectory for session ${params.sessionKey}`);

  // Flush immediately on task end to ensure reward processing
  flushBuffer();
}

/**
 * Log an LLM call for the current trajectory.
 */
export function logLLMCall(params: {
  sessionKey: string;
  messages: Array<{ role: string; content: string }>;
  model?: string;
  provider?: string;
  response?: { text?: string; [key: string]: unknown };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  reasoning?: { thinking?: string; [key: string]: unknown };
  error?: string;
}): void {
  const trajectory = activeTrajectories.get(params.sessionKey);
  if (!trajectory) {
    return;
  }

  const event = createEvent(trajectory, "llm_call", {
    messages: params.messages,
    model_params: {
      model: params.model,
      provider: params.provider,
    },
    response: params.response,
    usage: params.usage
      ? {
          input_tokens: params.usage.inputTokens,
          output_tokens: params.usage.outputTokens,
          reasoning_tokens: params.usage.reasoningTokens,
          total_tokens:
            (params.usage.inputTokens ?? 0) +
            (params.usage.outputTokens ?? 0) +
            (params.usage.reasoningTokens ?? 0),
        }
      : undefined,
    reasoning: params.reasoning,
    error: params.error,
  } satisfies LLMCallPayload);

  bufferEvent(event);
}

/**
 * Log a tool call for the current trajectory.
 */
export function logToolCall(params: {
  sessionKey: string;
  toolName: string;
  toolInput: unknown;
  toolOutput?: unknown;
  error?: string;
  durationMs?: number;
}): void {
  const trajectory = activeTrajectories.get(params.sessionKey);
  if (!trajectory) {
    return;
  }

  const event = createEvent(trajectory, "tool_call", {
    tool_name: params.toolName,
    tool_input: params.toolInput,
    tool_output: params.toolOutput,
    error: params.error,
    duration_ms: params.durationMs,
  } satisfies ToolCallPayload);

  bufferEvent(event);
}

/**
 * Log an agent definition.
 */
export function logAgentDefinition(params: {
  sessionKey: string;
  agentId: string;
  name?: string;
  description?: string;
  tools?: string[];
  systemPrompt?: string;
  parentAgentId?: string;
}): void {
  const trajectory = activeTrajectories.get(params.sessionKey);
  if (!trajectory) {
    return;
  }

  const event = createEvent(trajectory, "agent_definition", {
    agent_id: params.agentId,
    name: params.name,
    description: params.description,
    tools: params.tools,
    system_prompt: params.systemPrompt,
    parent_agent_id: params.parentAgentId,
  } satisfies AgentDefinitionPayload);

  bufferEvent(event);
}

/**
 * Get the active trajectory for a session.
 */
export function getActiveTrajectory(sessionKey: string): ActiveTrajectory | undefined {
  return activeTrajectories.get(sessionKey);
}

/**
 * Check if a session has an active trajectory.
 */
export function hasActiveTrajectory(sessionKey: string): boolean {
  return activeTrajectories.has(sessionKey);
}

/**
 * Create a trajectory event.
 */
function createEvent(
  trajectory: ActiveTrajectory,
  eventType: TrajectoryEventType,
  payload: Record<string, unknown>,
): TrajectoryEvent {
  return {
    event_id: generateEventId(),
    run_id: trajectory.runId,
    agent_id: trajectory.agentId,
    parent_agent_id: null,
    invocation_id: `${trajectory.runId}-${trajectory.taskId}`,
    task_id: trajectory.taskId,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  };
}

/**
 * Buffer an event for batched sending.
 */
function bufferEvent(event: TrajectoryEvent): void {
  eventBuffer.push(event);

  // Start flush timer if not already running
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushBuffer();
    }, BUFFER_SETTINGS.flushIntervalMs);
  }

  // Flush immediately if buffer is full
  if (eventBuffer.length >= BUFFER_SETTINGS.maxSize) {
    flushBuffer();
  }
}

/**
 * Flush the event buffer to Marlo.
 */
export async function flushBuffer(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (eventBuffer.length === 0) {
    return;
  }

  const events = eventBuffer;
  eventBuffer = [];

  const client = getMarloClient();
  if (!client) {
    log.debug("Marlo client not initialized, discarding events");
    return;
  }

  try {
    await client.ingestEvents(events);
  } catch (error) {
    log.warn(`Failed to flush events to Marlo: ${error}`);
    // Events are lost on failure - could implement retry queue later
  }
}

/**
 * Shutdown trajectory capture, flushing any remaining events.
 */
export async function shutdownTrajectoryCapture(): Promise<void> {
  await flushBuffer();
  activeTrajectories.clear();
}
