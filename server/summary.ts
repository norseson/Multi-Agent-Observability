import type { Database } from "bun:sqlite";
import type { IncomingEvent, StoredEvent } from "./types";

interface RunSummaryStats {
  tools_used: string[];
  total_events: number;
  tool_errors: number;
  total_duration_ms: number;
  files_modified: string[];
  task_statuses: Record<string, string>;
  risk_events: { low: number; med: number; high: number };

  // Extended multi-agent stats
  agents_involved: string[];
  tasks_completed: number;
  tasks_failed: number;
  handoffs: number;
  errors_by_type: Record<string, number>;
  event_type_counts: Record<string, number>;
}

/**
 * Generate a run summary event by analyzing all events for a given run_id and agent_id
 */
export function generateRunSummary(
  db: Database,
  runId: string,
  agentId: string
): IncomingEvent {
  // Query all events for this run
  const rows = db
    .prepare(
      `SELECT * FROM events
       WHERE run_id = ? AND agent_id = ?
       ORDER BY created_at ASC`
    )
    .all(runId, agentId) as Array<Record<string, unknown>>;

  const events: StoredEvent[] = rows.map((row) => ({
    id: row.id as number,
    event_id: row.event_id as string,
    source_app: row.source_app as string,
    session_id: row.session_id as string,
    event_type: row.event_type as string,
    tool_name: row.tool_name as string | null,
    summary: row.summary as string,
    payload: JSON.parse(row.payload as string),
    created_at: row.created_at as string,
    run_id: row.run_id as string | null,
    agent_id: row.agent_id as string | null,
    parent_event_id: row.parent_event_id as string | null,
    task_id: row.task_id as string | null,
    duration_ms: row.duration_ms as number | null,
    exit_code: row.exit_code as number | null,
    risk_level: row.risk_level as "low" | "med" | "high" | null,
    agent_state: row.agent_state as "idle" | "active" | "waiting" | "error" | null,
    error_type: row.error_type as string | null,
  }));

  // Analyze events
  const stats: RunSummaryStats = {
    tools_used: [],
    total_events: events.length,
    tool_errors: 0,
    total_duration_ms: 0,
    files_modified: [],
    task_statuses: {},
    risk_events: { low: 0, med: 0, high: 0 },
    agents_involved: [],
    tasks_completed: 0,
    tasks_failed: 0,
    handoffs: 0,
    errors_by_type: {},
    event_type_counts: {},
  };

  const toolSet = new Set<string>();
  const fileSet = new Set<string>();
  const agentSet = new Set<string>();

  for (const event of events) {
    // Track tools
    if (event.tool_name) {
      toolSet.add(event.tool_name);
    }

    // Track agents
    if (event.agent_id) {
      agentSet.add(event.agent_id);
    }

    // Count event types
    stats.event_type_counts[event.event_type] = (stats.event_type_counts[event.event_type] || 0) + 1;

    // Count errors
    if (event.exit_code !== null && event.exit_code !== 0) {
      stats.tool_errors++;
    }

    // Sum duration
    if (event.duration_ms !== null) {
      stats.total_duration_ms += event.duration_ms;
    }

    // Track risk levels
    if (event.risk_level) {
      stats.risk_events[event.risk_level]++;
    }

    // Count handoffs
    if (event.event_type === 'handoff.completed') {
      stats.handoffs++;
    }

    // Count task completions/failures
    if (event.event_type === 'task.completed') {
      stats.tasks_completed++;
    }
    if (event.event_type === 'task.failed') {
      stats.tasks_failed++;
    }

    // Track error types
    if (event.error_type) {
      stats.errors_by_type[event.error_type] = (stats.errors_by_type[event.error_type] || 0) + 1;
    }

    // Extract file paths from payloads
    if (event.payload) {
      const payload = event.payload as Record<string, unknown>;
      if (payload.file_path && typeof payload.file_path === "string") {
        fileSet.add(payload.file_path);
      }
      if (payload.tool_input) {
        const toolInput = payload.tool_input as Record<string, unknown>;
        if (toolInput.file_path && typeof toolInput.file_path === "string") {
          fileSet.add(toolInput.file_path);
        }
      }
    }

    // Track task statuses
    if (event.task_id) {
      const status = event.event_type.includes("Post") ? "completed" : "started";
      stats.task_statuses[event.task_id] = status;
    }
  }

  stats.tools_used = Array.from(toolSet);
  stats.files_modified = Array.from(fileSet);
  stats.agents_involved = Array.from(agentSet);

  // Find first and last event
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  // Generate summary text
  const agents = stats.agents_involved.length;
  const summaryText = `Run completed: ${stats.total_events} events, ${stats.tools_used.length} tools, ${agents} agent${agents !== 1 ? 's' : ''}, ${stats.tool_errors} errors, ${stats.handoffs} handoffs`;

  return {
    source_app: agentId,
    session_id: firstEvent?.session_id || "unknown",
    event_type: "run.summary",
    summary: summaryText,
    run_id: runId,
    agent_id: agentId,
    payload: {
      ...stats,
      start_time: firstEvent?.created_at,
      end_time: lastEvent?.created_at,
    },
    timestamp: new Date().toISOString(),
  };
}
