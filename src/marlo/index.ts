/**
 * Marlo integration for Moltbot.
 *
 * Provides trajectory capture, reward evaluation, and learning injection
 * to help the AI assistant improve over time.
 *
 * @module marlo
 */

import type { MoltbotConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { initMarloClient, getMarloClient, shutdownMarloClient } from "./client.js";
import { isMarloEnabled, resolveMarloConfig, getMarloApiKey, getMarloApiUrl } from "./config.js";
import { startEventListener, stopEventListener } from "./event-listener.js";
import { clearLearningsCache } from "./learnings.js";
import { shutdownTrajectoryCapture } from "./trajectory.js";

const log = createSubsystemLogger("marlo");

// Export all types
export * from "./types.js";

// Export config utilities
export {
  isMarloEnabled,
  resolveMarloConfig,
  getMarloApiKey,
  getMarloApiUrl,
  isChannelExcluded,
  isValidApiKeyFormat,
} from "./config.js";

// Export client
export { MarloClient, getMarloClient, initMarloClient, shutdownMarloClient } from "./client.js";

// Export trajectory capture
export {
  startTrajectory,
  endTrajectory,
  logLLMCall,
  logToolCall,
  logAgentDefinition,
  getActiveTrajectory,
  hasActiveTrajectory,
  flushBuffer,
} from "./trajectory.js";

// Export learnings (prompt-based - legacy)
export {
  getActiveLearnings,
  getLearningsPromptSection,
  formatLearningsForPrompt,
  clearLearningsCache,
  invalidateLearningsCache,
} from "./learnings.js";

// Export learnings file sync (file-based - preferred)
export { syncLearningsFile, hasLearningsFile, removeLearningsFile } from "./learnings-sync.js";

// Export event listener (for intermediate step capture)
export { startEventListener, stopEventListener } from "./event-listener.js";

// Export capture hooks
export {
  startMessageCapture,
  endMessageCaptureSuccess,
  endMessageCaptureError,
  captureAgentLLMCall,
  captureAgentToolCall,
} from "./capture-hooks.js";

// Export constants
export { MOLTBOT_AGENT_ID, DEFAULT_MARLO_API_URL } from "./constants.js";

/**
 * Initialize Marlo integration.
 * Should be called during gateway startup.
 */
export async function initMarlo(config?: MoltbotConfig): Promise<boolean> {
  if (!isMarloEnabled(config)) {
    log.debug("Marlo integration is disabled");
    return false;
  }

  const apiKey = getMarloApiKey(config);
  if (!apiKey) {
    log.warn("Marlo enabled but no API key configured");
    return false;
  }

  const apiUrl = getMarloApiUrl(config);
  log.info(`Initializing Marlo integration (${apiUrl})`);

  try {
    const client = initMarloClient({ apiUrl, apiKey });

    // Verify API key
    const scope = await client.verifyApiKey();
    if (!scope) {
      log.warn("Failed to verify Marlo API key");
      shutdownMarloClient();
      return false;
    }

    // Start listening to agent events for intermediate step capture
    startEventListener();

    log.info(`Marlo initialized for project ${scope.project_id}`);
    return true;
  } catch (error) {
    log.error(`Failed to initialize Marlo: ${error}`);
    shutdownMarloClient();
    return false;
  }
}

/**
 * Shutdown Marlo integration.
 * Should be called during gateway shutdown.
 */
export async function shutdownMarlo(): Promise<void> {
  log.debug("Shutting down Marlo integration");

  try {
    // Stop event listener first
    stopEventListener();

    await shutdownTrajectoryCapture();
    clearLearningsCache();
    shutdownMarloClient();
    log.info("Marlo shutdown complete");
  } catch (error) {
    log.error(`Error during Marlo shutdown: ${error}`);
  }
}

/**
 * Check if Marlo is currently active (initialized and connected).
 */
export function isMarloActive(): boolean {
  return getMarloClient() !== null;
}

/**
 * Get Marlo status information.
 */
export async function getMarloStatus(config?: MoltbotConfig): Promise<{
  enabled: boolean;
  active: boolean;
  projectId?: string;
  apiUrl?: string;
}> {
  const enabled = isMarloEnabled(config);
  const client = getMarloClient();
  const active = client !== null;

  let projectId: string | undefined;
  if (active && client) {
    const scope = await client.getScope();
    projectId = scope?.project_id;
  }

  return {
    enabled,
    active,
    projectId,
    apiUrl: enabled ? getMarloApiUrl(config) : undefined,
  };
}
