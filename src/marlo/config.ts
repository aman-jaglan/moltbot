/**
 * Marlo configuration helpers.
 */

import type { MoltbotConfig } from "../config/config.js";
import { isTruthyEnvValue } from "../infra/env.js";
import {
  DEFAULT_MARLO_API_URL,
  DEFAULTS,
  ENV_MARLO_API_KEY,
  ENV_MARLO_API_URL,
  ENV_MARLO_AUTO_ACTIVATE,
  ENV_MARLO_ENABLED,
  ENV_MARLO_PROJECT_ID,
} from "./constants.js";
import type { MarloConfig } from "./types.js";

/**
 * Check if Marlo integration is enabled.
 */
export function isMarloEnabled(config?: MoltbotConfig): boolean {
  // Environment variable takes precedence
  const envEnabled = process.env[ENV_MARLO_ENABLED];
  if (envEnabled !== undefined) {
    return isTruthyEnvValue(envEnabled);
  }

  // Check config
  const marloConfig = config?.marlo;
  if (marloConfig?.enabled !== undefined) {
    return marloConfig.enabled;
  }

  // Disabled by default
  return false;
}

/**
 * Get the Marlo API key from config or environment.
 */
export function getMarloApiKey(config?: MoltbotConfig): string | undefined {
  // Environment variable takes precedence
  const envKey = process.env[ENV_MARLO_API_KEY];
  if (envKey?.trim()) {
    return envKey.trim();
  }

  // Check config
  return config?.marlo?.apiKey?.trim();
}

/**
 * Get the Marlo API URL from config or environment.
 */
export function getMarloApiUrl(config?: MoltbotConfig): string {
  // Environment variable takes precedence
  const envUrl = process.env[ENV_MARLO_API_URL];
  if (envUrl?.trim()) {
    return envUrl.trim().replace(/\/$/, "");
  }

  // Check config
  const configUrl = config?.marlo?.apiUrl?.trim();
  if (configUrl) {
    return configUrl.replace(/\/$/, "");
  }

  return DEFAULT_MARLO_API_URL;
}

/**
 * Get the resolved Marlo configuration.
 */
export function resolveMarloConfig(config?: MoltbotConfig): MarloConfig {
  const marloConfig = config?.marlo ?? {};

  return {
    enabled: isMarloEnabled(config),
    apiKey: getMarloApiKey(config),
    apiUrl: getMarloApiUrl(config),
    projectId: process.env[ENV_MARLO_PROJECT_ID] ?? marloConfig.projectId,
    agentId: marloConfig.agentId,
    capture: {
      tools: marloConfig.capture?.tools ?? DEFAULTS.capture.tools,
      llmCalls: marloConfig.capture?.llmCalls ?? DEFAULTS.capture.llmCalls,
      reasoning: marloConfig.capture?.reasoning ?? DEFAULTS.capture.reasoning,
      responses: marloConfig.capture?.responses ?? DEFAULTS.capture.responses,
    },
    privacy: {
      redactPII: marloConfig.privacy?.redactPII ?? DEFAULTS.privacy.redactPII,
      excludeChannels: marloConfig.privacy?.excludeChannels ?? [
        ...DEFAULTS.privacy.excludeChannels,
      ],
      excludePatterns: marloConfig.privacy?.excludePatterns ?? [
        ...DEFAULTS.privacy.excludePatterns,
      ],
    },
    learnings: {
      autoActivate:
        isTruthyEnvValue(process.env[ENV_MARLO_AUTO_ACTIVATE]) ||
        (marloConfig.learnings?.autoActivate ?? DEFAULTS.learnings.autoActivate),
      maxActive: marloConfig.learnings?.maxActive ?? DEFAULTS.learnings.maxActive,
      injectInPrompt: marloConfig.learnings?.injectInPrompt ?? DEFAULTS.learnings.injectInPrompt,
    },
  };
}

/**
 * Check if a channel should be excluded from Marlo capture.
 */
export function isChannelExcluded(channel: string, config?: MoltbotConfig): boolean {
  const resolved = resolveMarloConfig(config);
  const excludeChannels = resolved.privacy?.excludeChannels ?? [];
  return excludeChannels.includes(channel.toLowerCase());
}

/**
 * Validate the Marlo API key format.
 * Accepts both prefixed keys (marlo_sk_xxx) and hex string keys.
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  // Marlo API keys can be:
  // 1. Prefixed format: marlo_sk_xxx
  // 2. Hex string format: 64-character hex string
  if (/^marlo_[a-z]+_[a-zA-Z0-9_-]+$/.test(apiKey)) {
    return true;
  }
  // Hex string format (64 chars)
  if (/^[a-fA-F0-9]{64}$/.test(apiKey)) {
    return true;
  }
  return false;
}
