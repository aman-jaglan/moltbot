/**
 * Marlo capture hooks for Moltbot message processing.
 * These hooks integrate with the auto-reply dispatch flow.
 */

import type { MoltbotConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getMarloClient } from "./client.js";
import { isMarloEnabled, isChannelExcluded, resolveMarloConfig } from "./config.js";
import { syncLearningsFile } from "./learnings-sync.js";
import {
  startTrajectory,
  endTrajectory,
  logLLMCall,
  logToolCall,
  hasActiveTrajectory,
} from "./trajectory.js";

const log = createSubsystemLogger("marlo/capture");

/**
 * Check if Marlo is fully ready (enabled AND client initialized).
 */
function isMarloReady(config?: MoltbotConfig): boolean {
  return isMarloEnabled(config) && getMarloClient() !== null;
}

export interface CaptureContext {
  sessionKey: string;
  channel: string;
  body: string;
  /** Agent's workspace directory for learnings file sync */
  workspaceDir?: string;
  config?: MoltbotConfig;
}

/**
 * Start capturing a trajectory for an inbound message.
 * Also syncs learnings from Marlo API to the workspace file.
 *
 * Returns true if capture was started, false if skipped.
 */
export async function startMessageCapture(ctx: CaptureContext): Promise<boolean> {
  const { sessionKey, channel, body, workspaceDir, config } = ctx;

  // Check if Marlo is fully ready (enabled + client initialized)
  if (!isMarloReady(config)) {
    return false;
  }

  if (isChannelExcluded(channel, config)) {
    log.debug(`Skipping capture for excluded channel: ${channel}`);
    return false;
  }

  // Don't start a new trajectory if one is already active
  if (hasActiveTrajectory(sessionKey)) {
    log.debug(`Trajectory already active for session: ${sessionKey}`);
    return false;
  }

  const marloConfig = resolveMarloConfig(config);
  const agentId = marloConfig.agentId;
  const projectId = marloConfig.projectId;

  // Sync learnings file BEFORE starting task
  // This ensures learnings from previous tasks are available for this task
  if (workspaceDir && marloConfig.learnings?.injectInPrompt !== false) {
    try {
      await syncLearningsFile({
        workspaceDir,
        agentId,
        projectId,
      });
    } catch (error) {
      // Don't fail the task if learnings sync fails
      log.warn(`Failed to sync learnings before task: ${error}`);
    }
  }

  startTrajectory({
    sessionKey,
    task: body,
    channel,
    agentId,
    metadata: {
      source: "moltbot",
    },
  });

  log.debug(`Started trajectory for session: ${sessionKey}`);
  return true;
}

/**
 * End capturing a trajectory with success.
 */
export function endMessageCaptureSuccess(params: {
  sessionKey: string;
  response: string;
  config?: MoltbotConfig;
}): void {
  // Only proceed if Marlo is fully ready and we have an active trajectory
  if (!isMarloReady(params.config) || !hasActiveTrajectory(params.sessionKey)) {
    return;
  }

  endTrajectory({
    sessionKey: params.sessionKey,
    status: "success",
    finalAnswer: params.response,
  });

  log.debug(`Ended trajectory (success) for session: ${params.sessionKey}`);
}

/**
 * End capturing a trajectory with an error.
 */
export function endMessageCaptureError(params: {
  sessionKey: string;
  error: string;
  config?: MoltbotConfig;
}): void {
  // Only proceed if Marlo is fully ready and we have an active trajectory
  if (!isMarloReady(params.config) || !hasActiveTrajectory(params.sessionKey)) {
    return;
  }

  endTrajectory({
    sessionKey: params.sessionKey,
    status: "error",
    error: params.error,
  });

  log.debug(`Ended trajectory (error) for session: ${params.sessionKey}`);
}

/**
 * Log an LLM call during message processing.
 */
export function captureAgentLLMCall(params: {
  sessionKey: string;
  model: string;
  provider: string;
  messages?: Array<{ role: string; content: string }>;
  response?: { text?: string };
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  reasoning?: { thinking?: string };
  error?: string;
  config?: MoltbotConfig;
}): void {
  if (!isMarloReady(params.config)) {
    return;
  }

  const marloConfig = resolveMarloConfig(params.config);
  if (!marloConfig.capture?.llmCalls) {
    return;
  }

  logLLMCall({
    sessionKey: params.sessionKey,
    messages: params.messages ?? [],
    model: params.model,
    provider: params.provider,
    response: params.response,
    usage: params.usage,
    reasoning: marloConfig.capture?.reasoning ? params.reasoning : undefined,
    error: params.error,
  });
}

/**
 * Log a tool call during message processing.
 */
export function captureAgentToolCall(params: {
  sessionKey: string;
  toolName: string;
  toolInput: unknown;
  toolOutput?: unknown;
  error?: string;
  durationMs?: number;
  config?: MoltbotConfig;
}): void {
  if (!isMarloReady(params.config)) {
    return;
  }

  const marloConfig = resolveMarloConfig(params.config);
  if (!marloConfig.capture?.tools) {
    return;
  }

  logToolCall({
    sessionKey: params.sessionKey,
    toolName: params.toolName,
    toolInput: params.toolInput,
    toolOutput: params.toolOutput,
    error: params.error,
    durationMs: params.durationMs,
  });
}
