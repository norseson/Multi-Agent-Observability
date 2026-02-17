export interface IncomingEvent {
  event_id?: string;
  source_app: string;
  session_id: string;
  event_type: string;
  tool_name?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown>;
  timestamp?: string;

  // Correlation fields for ops layer
  run_id?: string | null;
  agent_id?: string | null;
  parent_event_id?: string | null;
  task_id?: string | null;
  duration_ms?: number | null;
  exit_code?: number | null;
  risk_level?: 'low' | 'med' | 'high' | null;

  // Extended instrumentation fields
  agent_state?: 'idle' | 'active' | 'waiting' | 'error' | null;
  error_type?: string | null;
}

export interface StoredEvent {
  id: number;
  event_id: string;
  source_app: string;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;

  // Correlation fields for ops layer
  run_id: string | null;
  agent_id: string | null;
  parent_event_id: string | null;
  task_id: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  risk_level: 'low' | 'med' | 'high' | null;

  // Extended instrumentation fields
  agent_state: 'idle' | 'active' | 'waiting' | 'error' | null;
  error_type: string | null;
}

export type EventCategory =
  | 'agent' | 'orchestration' | 'task' | 'run'
  | 'error' | 'planning' | 'tool' | 'system'
  | 'session' | 'guardrail' | 'memory' | 'hook';

export interface HistoryParams {
  limit: number;
  offset: number;
  source_app?: string;
  session_id?: string;
  event_type?: string;
  since?: string;
}

export interface HistoryResponse {
  events: StoredEvent[];
  total: number;
  filters: FiltersResponse;
}

export interface FiltersResponse {
  source_apps: string[];
  session_ids: string[];
  event_types: string[];
}

export type WSMessage =
  | { type: "snapshot"; events: StoredEvent[] }
  | { type: "event"; event: StoredEvent }
  | { type: "ping"; ts: string }
  | { type: "pong" };

// Trace correlation types
export interface TraceNode {
  event: StoredEvent;
  children: TraceNode[];
  depth: number;
}

export interface TraceResponse {
  root: StoredEvent;
  ancestors: StoredEvent[];
  descendants: TraceNode[];
}
