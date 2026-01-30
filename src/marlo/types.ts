/**
 * Marlo integration types.
 * These mirror the Marlo SDK's event schema for trajectory capture.
 */

export interface MarloConfig {
  enabled?: boolean;
  apiKey?: string;
  apiUrl?: string;
  projectId?: string;
  agentId?: string;
  capture?: {
    tools?: boolean;
    llmCalls?: boolean;
    reasoning?: boolean;
    responses?: boolean;
  };
  privacy?: {
    redactPII?: boolean;
    excludeChannels?: string[];
    excludePatterns?: string[];
  };
  learnings?: {
    autoActivate?: boolean;
    maxActive?: number;
    injectInPrompt?: boolean;
  };
}

export type TrajectoryEventType =
  | "task_start"
  | "task_end"
  | "llm_call"
  | "tool_call"
  | "agent_definition"
  | "log";

export interface TrajectoryEvent {
  event_id?: string;
  run_id: number; // API requires int
  agent_id: string;
  parent_agent_id?: string | null;
  invocation_id?: string;
  task_id?: number; // API requires int
  event_type: TrajectoryEventType;
  payload: Record<string, unknown>;
  created_at?: string;
}

export interface TaskStartPayload {
  task: string;
  metadata?: Record<string, unknown>;
}

export interface TaskEndPayload {
  status: "success" | "error" | "cancelled";
  final_answer?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface LLMCallPayload {
  messages: Array<{ role: string; content: string }>;
  model_params: {
    model?: string;
    provider?: string;
    [key: string]: unknown;
  };
  response?: {
    text?: string;
    [key: string]: unknown;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
  };
  reasoning?: {
    thinking?: string;
    [key: string]: unknown;
  };
  error?: string;
}

export interface ToolCallPayload {
  tool_name: string;
  tool_input: unknown;
  tool_output?: unknown;
  error?: string;
  duration_ms?: number;
}

export interface AgentDefinitionPayload {
  agent_id: string;
  name?: string;
  description?: string;
  tools?: string[];
  system_prompt?: string;
  parent_agent_id?: string | null;
}

/**
 * Learning object from Marlo API.
 * Based on actual database schema from marlo/storage/postgres/database.py
 */
export interface Learning {
  learning_id: string;
  learning_key: string;
  version: number;
  status: "pending" | "active" | "inactive" | "declined";
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
 *
 * Note: The API returns { learning_state: LearningState | null }
 */
export interface LearningState {
  /** Active learnings for the given learning_key */
  active: Learning[];
  /** Last update timestamp across all learnings */
  updated_at: string | null;
}

export interface IngestResponse {
  ingested: number;
  reward_skipped?: boolean;
  reward_skip_reason?: string;
  warning?: string;
}

export interface MarloScope {
  project_id: string;
  org_id: string;
  user_id: string;
}
