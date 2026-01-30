/**
 * Learnings file sync for Marlo integration.
 *
 * Syncs active learnings from Marlo API to a LEARNINGS.md file in the workspace.
 * The file is loaded as part of Project Context, so learnings are automatically
 * included in the agent's context without modifying the prompt builder.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getMarloClient } from "./client.js";
import { MOLTBOT_AGENT_ID } from "./constants.js";

const log = createSubsystemLogger("marlo/learnings-sync");

/** Filename for learnings in workspace */
const LEARNINGS_FILENAME = "LEARNINGS.md";

/** Header marker to identify Marlo-managed file */
const HEADER_MARKER = "<!-- marlo:learnings";

/**
 * Learning object from Marlo API.
 * Based on actual database schema from marlo/storage/postgres/database.py
 */
export interface LearningObject {
  learning_id: string;
  learning_key: string;
  version: number;
  status: string;
  agent_id: string | null;
  /** The actual learning text */
  learning: string;
  expected_outcome: string | null;
  basis: string | null;
  confidence: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Learning state from Marlo API /learnings endpoint.
 * Based on Database.fetch_learning_state in marlo/storage/postgres/database.py
 */
export interface LearningStateResponse {
  active: LearningObject[];
  updated_at: string | null;
}

/**
 * Parse the current version from existing LEARNINGS.md file.
 * Returns null if file doesn't exist or isn't Marlo-managed.
 */
function parseCurrentVersion(workspaceDir: string): string | null {
  const filePath = join(workspaceDir, LEARNINGS_FILENAME);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    // Look for: <!-- marlo:learnings version="2024-01-29T16:00:00Z" -->
    const match = content.match(/<!--\s*marlo:learnings\s+version="([^"]+)"\s*-->/);
    return match?.[1] ?? null;
  } catch (error) {
    log.warn(`Failed to read LEARNINGS.md: ${error}`);
    return null;
  }
}

/**
 * Format learnings into markdown content.
 */
function formatLearningsMarkdown(learnings: LearningObject[], updatedAt: string | null): string {
  const timestamp = updatedAt ?? new Date().toISOString();
  const lines: string[] = [
    `${HEADER_MARKER} version="${timestamp}" -->`,
    "",
    "# Active Learnings",
    "",
    "These learnings have been validated from previous interactions.",
    "Apply them where relevant to improve task outcomes.",
    "",
  ];

  if (learnings.length === 0) {
    lines.push("*No active learnings yet.*");
    lines.push("");
    return lines.join("\n");
  }

  for (let i = 0; i < learnings.length; i++) {
    const l = learnings[i]!;
    const confidence =
      l.confidence != null ? ` (${Math.round(l.confidence * 100)}% confidence)` : "";

    lines.push(`${i + 1}. **${l.learning}**${confidence}`);

    if (l.expected_outcome) {
      lines.push(`   - Expected outcome: ${l.expected_outcome}`);
    }
    if (l.basis) {
      lines.push(`   - Basis: ${l.basis}`);
    }

    lines.push("");
  }

  lines.push("---");
  lines.push(`*Last synced: ${timestamp}*`);
  lines.push("");

  return lines.join("\n");
}

/**
 * Write learnings to file.
 */
function writeLearningsFile(
  workspaceDir: string,
  learnings: LearningObject[],
  updatedAt: string | null,
): void {
  const filePath = join(workspaceDir, LEARNINGS_FILENAME);
  const content = formatLearningsMarkdown(learnings, updatedAt);

  try {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(filePath, content, "utf-8");
    log.debug(`Wrote ${learnings.length} learnings to ${filePath}`);
  } catch (error) {
    log.error(`Failed to write LEARNINGS.md: ${error}`);
  }
}

/**
 * Sync learnings from Marlo API to LEARNINGS.md file.
 *
 * Called at the start of each task to ensure learnings are up-to-date.
 * Only writes to file if the version has changed.
 *
 * @param workspaceDir - The agent's workspace directory
 * @param learningKey - Key to fetch learnings for (typically projectId:agentId or just agentId)
 * @param force - Force sync even if version hasn't changed
 * @returns true if file was updated, false otherwise
 */
export async function syncLearningsFile(params: {
  workspaceDir: string;
  learningKey?: string;
  projectId?: string;
  agentId?: string;
  force?: boolean;
}): Promise<boolean> {
  const { workspaceDir, force = false } = params;

  const client = getMarloClient();
  if (!client) {
    log.debug("Marlo client not initialized, skipping learnings sync");
    return false;
  }

  // Build learning key: projectId:agentId or just agentId
  const agentId = params.agentId ?? MOLTBOT_AGENT_ID;
  const learningKey =
    params.learningKey ?? (params.projectId ? `${params.projectId}:${agentId}` : agentId);

  try {
    // Fetch learning state from Marlo API
    const learningState = await client.getLearnings(learningKey);

    if (!learningState) {
      log.debug(`No learning state returned for key: ${learningKey}`);
      return false;
    }

    // Cast to our expected structure based on actual Marlo API
    const state = learningState as unknown as LearningStateResponse;
    const activeLearnings = state.active ?? [];
    const updatedAt = state.updated_at ?? null;

    // Check if we need to update
    if (!force) {
      const currentVersion = parseCurrentVersion(workspaceDir);
      if (currentVersion && currentVersion === updatedAt) {
        log.debug(`Learnings file is up-to-date (version: ${currentVersion})`);
        return false;
      }
    }

    // Write updated learnings to file
    writeLearningsFile(workspaceDir, activeLearnings, updatedAt);
    log.info(`Synced ${activeLearnings.length} learnings to ${workspaceDir}/${LEARNINGS_FILENAME}`);

    return true;
  } catch (error) {
    log.warn(`Failed to sync learnings: ${error}`);
    return false;
  }
}

/**
 * Check if a LEARNINGS.md file exists and is Marlo-managed.
 */
export function hasLearningsFile(workspaceDir: string): boolean {
  const filePath = join(workspaceDir, LEARNINGS_FILENAME);
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return content.includes(HEADER_MARKER);
  } catch {
    return false;
  }
}

/**
 * Remove the LEARNINGS.md file (e.g., when Marlo is disabled).
 */
export function removeLearningsFile(workspaceDir: string): boolean {
  const filePath = join(workspaceDir, LEARNINGS_FILENAME);
  if (!existsSync(filePath)) {
    return false;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    // Only remove if it's Marlo-managed
    if (!content.includes(HEADER_MARKER)) {
      log.debug("LEARNINGS.md exists but is not Marlo-managed, skipping removal");
      return false;
    }

    const { unlinkSync } = require("node:fs");
    unlinkSync(filePath);
    log.info(`Removed Marlo-managed ${LEARNINGS_FILENAME}`);
    return true;
  } catch (error) {
    log.warn(`Failed to remove LEARNINGS.md: ${error}`);
    return false;
  }
}
