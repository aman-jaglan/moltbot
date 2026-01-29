/**
 * Marlo integration setup for onboarding wizard.
 */

import type { MoltbotConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { MarloClient } from "../marlo/client.js";
import { DEFAULT_MARLO_API_URL } from "../marlo/constants.js";
import { isValidApiKeyFormat } from "../marlo/config.js";
import type { WizardPrompter } from "./prompts.js";

export interface MarloSetupResult {
  config: MoltbotConfig;
  enabled: boolean;
  projectId?: string;
}

/**
 * Setup Marlo integration during onboarding.
 */
export async function setupMarlo(
  config: MoltbotConfig,
  _runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<MarloSetupResult> {
  // Check if Marlo is already configured
  const existingEnabled = config.marlo?.enabled ?? false;
  const existingApiKey = config.marlo?.apiKey;

  // Show intro note
  await prompter.note(
    [
      "Learning for Moltbot, powered by Marlo",
      "",
      "Marlo captures what your assistant does (trajectories),",
      "evaluates task success (rewards), and generates learnings",
      "to help your assistant improve over time.",
      "",
      "• Your data stays private",
      "• You control what's captured",
      "",
      "Get your API key at: https://app.marshmallo.ai/login/",
    ].join("\n"),
    "🧠 Marlo",
  );

  const enableMarlo = await prompter.confirm({
    message: existingEnabled
      ? "Marlo is currently enabled. Keep it enabled?"
      : "Enable Marlo learning integration?",
    initialValue: existingEnabled,
  });

  if (!enableMarlo) {
    return {
      config: {
        ...config,
        marlo: {
          ...config.marlo,
          enabled: false,
        },
      },
      enabled: false,
    };
  }

  // Prompt for API key
  const apiKey = await prompter.text({
    message: "Marlo API Key",
    initialValue: existingApiKey ?? "",
    validate: (value) => {
      if (!value.trim()) {
        return "API key is required";
      }
      if (!isValidApiKeyFormat(value.trim())) {
        return "Invalid API key format. Should start with marlo_sk_";
      }
      return undefined;
    },
  });

  const trimmedApiKey = apiKey.trim();

  // Verify API key
  await prompter.note("Verifying API key...", "Marlo");

  const client = new MarloClient({
    apiUrl: DEFAULT_MARLO_API_URL,
    apiKey: trimmedApiKey,
  });

  const scope = await client.verifyApiKey();

  if (!scope) {
    await prompter.note(
      [
        "❌ Could not verify API key.",
        "",
        "Please check that your API key is correct and try again.",
        "You can get a new key at: https://app.marshmallo.ai/dashboard/projects",
        "",
        "Marlo will be disabled for now. You can enable it later in your config.",
      ].join("\n"),
      "Verification Failed",
    );

    return {
      config: {
        ...config,
        marlo: {
          ...config.marlo,
          enabled: false,
        },
      },
      enabled: false,
    };
  }

  await prompter.note(
    [
      "✅ API key verified!",
      "",
      `Project: ${scope.project_id}`,
      "",
      "Marlo will now capture trajectories and generate learnings.",
      "View your dashboard at: https://app.marshmallo.ai/dashboard",
    ].join("\n"),
    "Connected",
  );

  // Ask about auto-activate
  const autoActivate = await prompter.confirm({
    message: "Auto-activate new learnings? (or manually review first)",
    initialValue: config.marlo?.learnings?.autoActivate ?? false,
  });

  return {
    config: {
      ...config,
      marlo: {
        enabled: true,
        apiKey: trimmedApiKey,
        apiUrl: DEFAULT_MARLO_API_URL,
        capture: {
          tools: true,
          llmCalls: true,
          reasoning: true,
          responses: true,
        },
        privacy: {
          redactPII: true,
        },
        learnings: {
          autoActivate,
          injectInPrompt: true,
          maxActive: 20,
        },
      },
    },
    enabled: true,
    projectId: scope.project_id,
  };
}

/**
 * Quick check if Marlo setup should be skipped.
 */
export function shouldSkipMarloSetup(opts: { skipMarlo?: boolean }): boolean {
  return opts.skipMarlo === true;
}
