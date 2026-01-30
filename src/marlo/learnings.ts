/**
 * Learning retrieval and prompt injection for Marlo integration.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { getMarloClient } from "./client.js";
import { LEARNING_CACHE, MOLTBOT_AGENT_ID } from "./constants.js";
import type { Learning } from "./types.js";

const log = createSubsystemLogger("marlo/learnings");

// Simple in-memory cache for learnings
interface CacheEntry {
  learnings: Learning[];
  expiresAt: number;
}

const learningCache = new Map<string, CacheEntry>();

/**
 * Get active learnings for an agent, with caching.
 *
 * Note: This is the legacy API-based approach for prompt injection.
 * The preferred approach is file-based sync via learnings-sync.ts,
 * which writes to LEARNINGS.md and is loaded as Project Context.
 */
export async function getActiveLearnings(params: {
  agentId?: string;
  projectId?: string;
  forceRefresh?: boolean;
}): Promise<Learning[]> {
  const agentId = params.agentId ?? MOLTBOT_AGENT_ID;
  const learningKey = params.projectId ? `${params.projectId}:${agentId}` : agentId;

  // Check cache first
  if (!params.forceRefresh) {
    const cached = learningCache.get(learningKey);
    if (cached && cached.expiresAt > Date.now()) {
      log.debug(`Returning ${cached.learnings.length} cached learnings for ${learningKey}`);
      return cached.learnings;
    }
  }

  // Fetch from Marlo
  const client = getMarloClient();
  if (!client) {
    log.debug("Marlo client not initialized");
    return [];
  }

  try {
    // getActiveLearningsForPrompt returns the .active array from learning_state
    const learnings = await client.getActiveLearningsForPrompt(learningKey);

    // Update cache
    learningCache.set(learningKey, {
      learnings,
      expiresAt: Date.now() + LEARNING_CACHE.ttlMs,
    });

    // Prune cache if too large
    if (learningCache.size > LEARNING_CACHE.maxEntries) {
      const oldestKey = learningCache.keys().next().value;
      if (oldestKey) {
        learningCache.delete(oldestKey);
      }
    }

    log.debug(`Fetched ${learnings.length} active learnings for ${learningKey}`);
    return learnings;
  } catch (error) {
    log.warn(`Failed to fetch learnings: ${error}`);
    return [];
  }
}

/**
 * Format learnings for injection into system prompt.
 */
export function formatLearningsForPrompt(learnings: Learning[]): string {
  if (learnings.length === 0) {
    return "";
  }

  const lines = [
    "## Active Learnings",
    "The following learnings have been validated from previous interactions. Apply them where relevant:",
    "",
  ];

  for (let i = 0; i < learnings.length; i++) {
    const learning = learnings[i]!;
    // confidence can be null
    const confidence =
      learning.confidence != null
        ? ` (confidence: ${(learning.confidence * 100).toFixed(0)}%)`
        : "";
    lines.push(`${i + 1}. ${learning.learning}${confidence}`);

    if (learning.expected_outcome) {
      lines.push(`   Expected outcome: ${learning.expected_outcome}`);
    }
  }

  return lines.join("\n");
}

/**
 * Get learnings formatted for prompt injection.
 * Returns empty string if no learnings or Marlo not enabled.
 */
export async function getLearningsPromptSection(params: {
  agentId?: string;
  projectId?: string;
  maxLearnings?: number;
}): Promise<string> {
  const learnings = await getActiveLearnings({
    agentId: params.agentId,
    projectId: params.projectId,
  });

  if (learnings.length === 0) {
    return "";
  }

  // Limit number of learnings if specified
  const limitedLearnings = params.maxLearnings
    ? learnings.slice(0, params.maxLearnings)
    : learnings;

  return formatLearningsForPrompt(limitedLearnings);
}

/**
 * Clear the learnings cache.
 */
export function clearLearningsCache(): void {
  learningCache.clear();
  log.debug("Learnings cache cleared");
}

/**
 * Invalidate cache for a specific agent.
 */
export function invalidateLearningsCache(params: { agentId?: string; projectId?: string }): void {
  const agentId = params.agentId ?? MOLTBOT_AGENT_ID;
  const learningKey = params.projectId ? `${params.projectId}:${agentId}` : agentId;
  learningCache.delete(learningKey);
  log.debug(`Invalidated learnings cache for ${learningKey}`);
}
