/**
 * Marlo integration configuration types.
 */

export interface MarloCaptureConfig {
  /** Capture tool calls (default: true). */
  tools?: boolean;
  /** Capture LLM calls (default: true). */
  llmCalls?: boolean;
  /** Capture extended thinking/reasoning (default: true). */
  reasoning?: boolean;
  /** Capture final responses (default: true). */
  responses?: boolean;
}

export interface MarloPrivacyConfig {
  /** Auto-redact PII like emails and phone numbers (default: true). */
  redactPII?: boolean;
  /** Channel names to exclude from capture. */
  excludeChannels?: string[];
  /** Regex patterns to redact from captured data. */
  excludePatterns?: string[];
}

export interface MarloLearningsConfig {
  /** Automatically activate new learnings without manual approval (default: false). */
  autoActivate?: boolean;
  /** Maximum number of active learnings to maintain (default: 20). */
  maxActive?: number;
  /** Inject active learnings into system prompts (default: true). */
  injectInPrompt?: boolean;
}

export interface MarloConfig {
  /** Enable Marlo integration (default: false). */
  enabled?: boolean;
  /** Marlo API key. Can also be set via MARLO_API_KEY env var. */
  apiKey?: string;
  /** Marlo API URL (default: https://api.marlo.ai). */
  apiUrl?: string;
  /** Marlo project ID. */
  projectId?: string;
  /** Agent ID for this Moltbot instance. */
  agentId?: string;
  /** What to capture and send to Marlo. */
  capture?: MarloCaptureConfig;
  /** Privacy controls for captured data. */
  privacy?: MarloPrivacyConfig;
  /** Learning retrieval and injection settings. */
  learnings?: MarloLearningsConfig;
}
