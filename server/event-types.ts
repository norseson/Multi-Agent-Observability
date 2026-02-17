/**
 * Canonical event type constants and typed payload interfaces
 * for the Multi-Agent Observability Event Model.
 *
 * This file centralizes all event type strings and payload shapes.
 * server/types.ts remains the generic IncomingEvent/StoredEvent interface.
 */

// ---------------------------------------------------------------------------
// Event Type Constants
// ---------------------------------------------------------------------------

export const EventTypes = {
  // Agent lifecycle (Tier 0)
  AGENT_CREATED: 'agent.created',
  AGENT_SPAWNED: 'agent.spawned',
  AGENT_STATE_CHANGED: 'agent.state_changed',
  AGENT_TERMINATED: 'agent.terminated',
  AGENT_ERROR: 'agent.error',

  // Orchestration (Tier 0)
  HANDOFF_INITIATED: 'handoff.initiated',
  HANDOFF_COMPLETED: 'handoff.completed',
  DELEGATION_REQUESTED: 'delegation.requested',
  DELEGATION_RESULT: 'delegation.result',
  TEAM_FORMED: 'team.formed',
  TEAM_DISBANDED: 'team.disbanded',
  COORDINATION_MESSAGE_SENT: 'coordination.message_sent',
  COORDINATION_DEADLOCK: 'coordination.deadlock',

  // Task lifecycle (Tier 0)
  TASK_CREATED: 'task.created',
  TASK_ASSIGNED: 'task.assigned',
  TASK_STARTED: 'task.started',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  TASK_RETRY: 'task.retry',

  // Run lifecycle (Tier 0)
  RUN_STARTED: 'run.started',
  RUN_COMPLETED: 'run.completed',
  RUN_FAILED: 'run.failed',
  RUN_SUMMARY: 'run.summary',

  // Error handling (Tier 0)
  ERROR_OCCURRED: 'error.occurred',
  ERROR_UNHANDLED: 'error.unhandled',
  ERROR_TIMEOUT: 'error.timeout',
  ERROR_RECOVERY_ATTEMPTED: 'error.recovery_attempted',
  ERROR_RECOVERY_SUCCEEDED: 'error.recovery_succeeded',

  // Planning & reasoning (Tier 1)
  PLAN_CREATED: 'plan.created',
  PLAN_UPDATED: 'plan.updated',
  PLAN_FAILED: 'plan.failed',
  REASONING_STEP: 'reasoning.step',
  REASONING_CONCLUSION: 'reasoning.conclusion',
  DECISION_MADE: 'decision.made',
  STRATEGY_SELECTED: 'strategy.selected',
  STRATEGY_CHANGED: 'strategy.changed',

  // Tool lifecycle (Tier 1)
  TOOL_TIMEOUT: 'tool.timeout',
  TOOL_RETRY: 'tool.retry',
  TOOL_VALIDATION_FAILED: 'tool.validation_failed',
  TOOL_ERROR: 'tool.error',
  TOOL_OUTPUT_TRUNCATED: 'tool.output_truncated',

  // System health (Tier 1)
  MEMORY_WARNING: 'memory.warning',
  MEMORY_CRITICAL: 'memory.critical',
  CONNECTION_CONNECTING: 'connection.connecting',
  CONNECTION_CONNECTED: 'connection.connected',
  CONNECTION_FAILED: 'connection.failed',
  CONNECTION_RECONNECTING: 'connection.reconnecting',
  SYSTEM_DEGRADED: 'system.degraded',
  SYSTEM_HEALTH_CHECK: 'system.health_check',

  // Session lifecycle (Tier 1)
  SESSION_STARTED: 'session.started',
  SESSION_ENDED: 'session.ended',
  SESSION_TIMEOUT: 'session.timeout',
  SESSION_ERROR: 'session.error',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

// ---------------------------------------------------------------------------
// Typed Payload Interfaces
// ---------------------------------------------------------------------------

export interface AgentCreatedPayload {
  agent_name: string;
  agent_type?: string;
  parent_agent_id?: string;
  config?: Record<string, unknown>;
}

export interface AgentStateChangedPayload {
  previous_state: 'idle' | 'active' | 'waiting' | 'error';
  new_state: 'idle' | 'active' | 'waiting' | 'error';
  reason?: string;
}

export interface HandoffPayload {
  from_agent_id: string;
  to_agent_id: string;
  context?: Record<string, unknown>;
  reason?: string;
}

export interface TaskPayload {
  task_name: string;
  task_description?: string;
  assigned_agent_id?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

export interface ErrorPayload {
  error_type: string;
  error_message: string;
  error_stack?: string;
  recoverable: boolean;
  source_event_id?: string;
}

export interface RunPayload {
  run_name?: string;
  prompt?: string;
  model?: string;
  exit_reason?: 'success' | 'error' | 'timeout' | 'cancelled';
}

export interface PlanPayload {
  goal: string;
  steps: Array<{ step_number: number; action: string; expected_outcome?: string }>;
  confidence?: number;
}

export interface TeamPayload {
  team_name: string;
  member_ids: string[];
  strategy?: 'sequential' | 'parallel' | 'hierarchical';
}
