/**
 * Marlo API client for trajectory capture and learning retrieval.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { API_ENDPOINTS, HTTP_SETTINGS } from "./constants.js";
import type {
  IngestResponse,
  Learning,
  LearningState,
  MarloScope,
  TrajectoryEvent,
} from "./types.js";

const log = createSubsystemLogger("marlo/client");

export interface MarloClientOptions {
  apiUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export class MarloClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private scopeCache: { scope: MarloScope; expiresAt: number } | null = null;

  constructor(options: MarloClientOptions) {
    this.apiUrl = options.apiUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? HTTP_SETTINGS.timeoutMs;
  }

  /**
   * Send trajectory events to Marlo.
   */
  async ingestEvents(events: TrajectoryEvent[]): Promise<IngestResponse> {
    if (events.length === 0) {
      return { ingested: 0 };
    }

    const url = `${this.apiUrl}${API_ENDPOINTS.events}`;
    log.debug(`Ingesting ${events.length} events to ${url}`);

    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ events }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        log.warn(`Marlo ingest failed: ${response.status} ${text}`);
        throw new Error(`Marlo ingest failed: ${response.status}`);
      }

      const result = (await response.json()) as IngestResponse;
      log.debug(`Ingested ${result.ingested} events`);

      if (result.warning) {
        log.warn(`Marlo warning: ${result.warning}`);
      }

      return result;
    } catch (error) {
      log.error(`Failed to ingest events: ${error}`);
      throw error;
    }
  }

  /**
   * Get learning state for an agent.
   *
   * The API returns: { learning_state: { active: Learning[], updated_at: string | null } | null }
   * Based on marlo/api/ingest/routes.py POST /learnings endpoint.
   */
  async getLearnings(learningKey: string): Promise<LearningState | null> {
    const url = `${this.apiUrl}${API_ENDPOINTS.learnings}`;
    log.debug(`Fetching learnings for key: ${learningKey}`);

    try {
      const response = await this.fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ learning_key: learningKey }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        const text = await response.text().catch(() => "");
        log.warn(`Failed to fetch learnings: ${response.status} ${text}`);
        return null;
      }

      // API returns { learning_state: LearningState | null }
      const result = (await response.json()) as { learning_state: LearningState | null };
      return result.learning_state;
    } catch (error) {
      log.error(`Failed to fetch learnings: ${error}`);
      return null;
    }
  }

  /**
   * Get active learnings for prompt injection.
   * Returns the active learnings array from the learning state.
   */
  async getActiveLearningsForPrompt(learningKey: string): Promise<Learning[]> {
    const state = await this.getLearnings(learningKey);
    // learning_state.active contains only active learnings (filtered by DB query)
    return state?.active ?? [];
  }

  /**
   * Verify the API key is valid by fetching scope.
   */
  async verifyApiKey(): Promise<MarloScope | null> {
    const url = `${this.apiUrl}${API_ENDPOINTS.scope}`;
    log.debug("Verifying Marlo API key");

    try {
      const response = await this.fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        log.warn(`API key verification failed: ${response.status}`);
        return null;
      }

      const scope = (await response.json()) as MarloScope;
      this.scopeCache = {
        scope,
        expiresAt: Date.now() + 60000, // Cache for 1 minute
      };
      return scope;
    } catch (error) {
      log.error(`Failed to verify API key: ${error}`);
      return null;
    }
  }

  /**
   * Get cached scope or fetch fresh.
   */
  async getScope(): Promise<MarloScope | null> {
    if (this.scopeCache && this.scopeCache.expiresAt > Date.now()) {
      return this.scopeCache.scope;
    }
    return this.verifyApiKey();
  }

  /**
   * Internal fetch with timeout.
   */
  private async fetch(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Singleton client instance
let clientInstance: MarloClient | null = null;

/**
 * Initialize the Marlo client singleton.
 */
export function initMarloClient(options: MarloClientOptions): MarloClient {
  clientInstance = new MarloClient(options);
  return clientInstance;
}

/**
 * Get the Marlo client singleton.
 */
export function getMarloClient(): MarloClient | null {
  return clientInstance;
}

/**
 * Shutdown the Marlo client.
 */
export function shutdownMarloClient(): void {
  clientInstance = null;
}
