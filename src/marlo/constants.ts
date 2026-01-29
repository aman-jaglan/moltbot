/**
 * Marlo integration constants.
 */

/** Default Marlo API URL */
export const DEFAULT_MARLO_API_URL = "https://api.marlo.ai";

/** Environment variable names */
export const ENV_MARLO_ENABLED = "MARLO_ENABLED";
export const ENV_MARLO_API_KEY = "MARLO_API_KEY";
export const ENV_MARLO_API_URL = "MARLO_API_URL";
export const ENV_MARLO_PROJECT_ID = "MARLO_PROJECT_ID";
export const ENV_MARLO_AUTO_ACTIVATE = "MARLO_AUTO_ACTIVATE";

/** API endpoints */
export const API_ENDPOINTS = {
  events: "/api/v1/events",
  learnings: "/api/v1/learnings",
  scope: "/internal/marlo/scope",
} as const;

/** Default configuration values */
export const DEFAULTS = {
  capture: {
    tools: true,
    llmCalls: true,
    reasoning: true,
    responses: true,
  },
  privacy: {
    redactPII: true,
    excludeChannels: [],
    excludePatterns: [],
  },
  learnings: {
    autoActivate: false,
    maxActive: 20,
    injectInPrompt: true,
  },
} as const;

/** Event buffer settings */
export const BUFFER_SETTINGS = {
  maxSize: 100,
  flushIntervalMs: 5000,
  maxRetries: 3,
  retryDelayMs: 1000,
} as const;

/** HTTP client settings */
export const HTTP_SETTINGS = {
  timeoutMs: 10000,
  maxRetries: 2,
} as const;

/** Learning cache settings */
export const LEARNING_CACHE = {
  ttlMs: 60000, // 1 minute
  maxEntries: 100,
} as const;

/** Agent ID for Moltbot */
export const MOLTBOT_AGENT_ID = "moltbot";
