/**
 * Server-Side Auto-Event Generation Engine
 *
 * Watches incoming events and generates synthetic events when patterns are detected.
 * Modeled on the existing run.summary auto-generation in server.ts.
 *
 * Rules:
 * - Session boundary detection (first event from new session → session.started)
 * - Error pattern detection (tool timeouts, repeated failures)
 * - Tool lifecycle detection (output truncation)
 * - Cascade prevention: ignores events from source_app === 'auto-events'
 */

import type { Database } from "bun:sqlite";
import type { IncomingEvent, StoredEvent } from "./types";
import { EventTypes } from "./event-types";

// ---------------------------------------------------------------------------
// In-memory session state
// ---------------------------------------------------------------------------

interface SessionState {
  sessionId: string;
  agentId: string;
  firstEventAt: string;
  lastEventAt: string;
  eventCount: number;
}

const activeSessions = new Map<string, SessionState>();
const SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes of inactivity

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Process an incoming event and return any auto-generated events.
 * Called from server.ts after insertEvent, before broadcast.
 */
export function processAutoEvents(
  db: Database,
  stored: StoredEvent
): IncomingEvent[] {
  // Cascade prevention — never process events we generated
  if (stored.source_app === 'auto-events') {
    return [];
  }

  const generated: IncomingEvent[] = [];

  generated.push(...detectSessionBoundaries(stored));
  generated.push(...detectErrorPatterns(db, stored));
  generated.push(...detectToolLifecycleEvents(stored));

  return generated;
}

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

/**
 * Detect new session boundaries.
 * Emits session.started on first event from an unseen session_id:agent_id pair.
 */
function detectSessionBoundaries(stored: StoredEvent): IncomingEvent[] {
  const agentKey = stored.agent_id || 'default';
  const key = `${stored.session_id}:${agentKey}`;
  const events: IncomingEvent[] = [];

  if (!activeSessions.has(key)) {
    activeSessions.set(key, {
      sessionId: stored.session_id,
      agentId: agentKey,
      firstEventAt: stored.created_at,
      lastEventAt: stored.created_at,
      eventCount: 1,
    });

    events.push({
      source_app: 'auto-events',
      session_id: stored.session_id,
      event_type: EventTypes.SESSION_STARTED,
      summary: `Session started: ${stored.session_id}`,
      agent_id: stored.agent_id || null,
      run_id: stored.run_id || null,
      payload: { detected_from_event_id: stored.event_id },
    });
  } else {
    const session = activeSessions.get(key)!;
    session.lastEventAt = stored.created_at;
    session.eventCount++;
  }

  return events;
}

/**
 * Detect error patterns:
 * 1. PostToolUse with duration_ms > 30000 → tool.timeout
 * 2. 3+ tool errors from same tool in 5 minutes → error.unhandled (repeated failure)
 */
function detectErrorPatterns(db: Database, stored: StoredEvent): IncomingEvent[] {
  const events: IncomingEvent[] = [];

  // Rule 1: Tool timeout detection
  if (stored.event_type === 'PostToolUse' && stored.duration_ms && stored.duration_ms > 30000) {
    events.push({
      source_app: 'auto-events',
      session_id: stored.session_id,
      event_type: EventTypes.TOOL_TIMEOUT,
      tool_name: stored.tool_name,
      summary: `Tool timeout: ${stored.tool_name || 'unknown'} took ${stored.duration_ms}ms`,
      parent_event_id: stored.event_id,
      agent_id: stored.agent_id || null,
      run_id: stored.run_id || null,
      duration_ms: stored.duration_ms,
      risk_level: 'high',
      payload: { threshold_ms: 30000, actual_ms: stored.duration_ms },
    });
  }

  // Rule 2: Repeated tool failures
  if (stored.exit_code !== null && stored.exit_code !== 0 && stored.tool_name) {
    try {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const agentId = stored.agent_id || '';
      const row = db
        .prepare(`
          SELECT COUNT(*) as cnt FROM events
          WHERE tool_name = ? AND exit_code != 0 AND exit_code IS NOT NULL
            AND (agent_id = ? OR (agent_id IS NULL AND ? = ''))
            AND created_at >= ?
        `)
        .get(stored.tool_name, agentId, agentId, fiveMinAgo) as { cnt: number } | undefined;

      if (row && row.cnt >= 3) {
        events.push({
          source_app: 'auto-events',
          session_id: stored.session_id,
          event_type: EventTypes.ERROR_UNHANDLED,
          tool_name: stored.tool_name,
          summary: `Repeated failures: ${stored.tool_name} (${row.cnt} in 5min)`,
          agent_id: stored.agent_id || null,
          run_id: stored.run_id || null,
          risk_level: 'high',
          error_type: 'repeated_failure',
          payload: { error_count: row.cnt, window_minutes: 5, tool: stored.tool_name },
        });
      }
    } catch {
      // Non-critical — skip pattern detection on DB error
    }
  }

  return events;
}

/**
 * Detect tool lifecycle events:
 * - Payload containing truncation marker → tool.output_truncated
 */
function detectToolLifecycleEvents(stored: StoredEvent): IncomingEvent[] {
  const events: IncomingEvent[] = [];

  if (stored.payload) {
    const payloadStr = JSON.stringify(stored.payload);
    if (payloadStr.includes('[truncated')) {
      events.push({
        source_app: 'auto-events',
        session_id: stored.session_id,
        event_type: EventTypes.TOOL_OUTPUT_TRUNCATED,
        tool_name: stored.tool_name,
        summary: `Output truncated: ${stored.tool_name || 'unknown'}`,
        parent_event_id: stored.event_id,
        agent_id: stored.agent_id || null,
        run_id: stored.run_id || null,
        payload: { original_event_id: stored.event_id },
      });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// Session timeout checker (periodic)
// ---------------------------------------------------------------------------

/**
 * Start periodic session timeout checker.
 * Every intervalMs, scans activeSessions for entries inactive > SESSION_TIMEOUT_MS.
 * Emits session.ended for each timed-out session and removes from map.
 */
export function startSessionTimeoutChecker(
  db: Database,
  emitCallback: (event: IncomingEvent) => void,
  intervalMs = 60_000
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const now = Date.now();
    for (const [key, session] of activeSessions) {
      const lastActive = new Date(session.lastEventAt).getTime();
      if (now - lastActive > SESSION_TIMEOUT_MS) {
        emitCallback({
          source_app: 'auto-events',
          session_id: session.sessionId,
          event_type: EventTypes.SESSION_ENDED,
          summary: `Session ended: ${session.sessionId} (${session.eventCount} events, inactive ${Math.round((now - lastActive) / 1000)}s)`,
          agent_id: session.agentId !== 'default' ? session.agentId : null,
          payload: {
            event_count: session.eventCount,
            first_event_at: session.firstEventAt,
            last_event_at: session.lastEventAt,
            duration_ms: lastActive - new Date(session.firstEventAt).getTime(),
            reason: 'timeout',
          },
        });
        activeSessions.delete(key);
      }
    }
  }, intervalMs);
}
