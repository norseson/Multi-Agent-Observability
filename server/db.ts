import { Database } from "bun:sqlite";
import type { IncomingEvent, StoredEvent, HistoryParams, FiltersResponse, TraceResponse, TraceNode } from "./types";
import { redactPayload } from "./redaction";

/**
 * Migrate schema to add correlation fields (non-destructive)
 */
function migrateSchema(db: Database): void {
  // Check existing columns
  const tableInfo = db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
  const existingColumns = new Set(tableInfo.map(col => col.name));

  const newColumns = [
    { name: 'run_id', type: 'TEXT' },
    { name: 'agent_id', type: 'TEXT' },
    { name: 'parent_event_id', type: 'TEXT' },
    { name: 'task_id', type: 'TEXT' },
    { name: 'duration_ms', type: 'INTEGER' },
    { name: 'exit_code', type: 'INTEGER' },
    { name: 'risk_level', type: "TEXT CHECK(risk_level IN ('low', 'med', 'high') OR risk_level IS NULL)" },
    { name: 'agent_state', type: 'TEXT' },
    { name: 'error_type', type: 'TEXT' },
  ];

  for (const col of newColumns) {
    if (!existingColumns.has(col.name)) {
      db.exec(`ALTER TABLE events ADD COLUMN ${col.name} ${col.type}`);
    }
  }
}

export function initDb(path = "./events.sqlite"): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");

  // Create base table
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id    TEXT UNIQUE NOT NULL,
      source_app  TEXT NOT NULL DEFAULT 'unknown',
      session_id  TEXT NOT NULL,
      event_type  TEXT NOT NULL,
      tool_name   TEXT,
      summary     TEXT,
      payload     TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f', 'now'))
    )
  `);

  // Migrate schema (add new columns if missing)
  migrateSchema(db);

  // Create original indexes
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_source_app ON events(source_app)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC)");

  // Create new correlation indexes
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_agent_id ON events(agent_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_parent_event_id ON events(parent_event_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_task_id ON events(task_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_trace_lookup ON events(run_id, agent_id, created_at)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_events_error_type ON events(error_type)");

  return db;
}

export function generateSummary(event: IncomingEvent): string {
  if (event.summary) return event.summary;

  const payload = event.payload;
  const tool = event.tool_name;

  if (tool && payload) {
    const input = payload.tool_input as Record<string, string> | undefined;
    if (input) {
      if (tool === "Bash" && input.command) return `Bash: ${input.command.slice(0, 80)}`;
      if (tool === "Write" && input.file_path) return `Write ${input.file_path}`;
      if (tool === "Read" && input.file_path) return `Read ${input.file_path}`;
      if (tool === "Edit" && input.file_path) return `Edit ${input.file_path}`;
      if (tool === "Glob" && input.pattern) return `Glob: ${input.pattern}`;
      if (tool === "Grep" && input.pattern) return `Grep: ${input.pattern}`;
      if (tool === "TodoWrite") return "TodoWrite";
      if (tool === "Task" && input.description) return `Task: ${input.description}`;
    }
  }

  return `${event.event_type}${tool ? ": " + tool : ""}`;
}

export function insertEvent(db: Database, event: IncomingEvent): StoredEvent {
  const eventId = event.event_id || crypto.randomUUID();
  const summary = generateSummary(event);
  const createdAt = event.timestamp || new Date().toISOString();

  // Apply redaction before stringification
  const safePayload = redactPayload(event.payload || {});
  const payloadStr = JSON.stringify(safePayload);

  const stmt = db.prepare(`
    INSERT INTO events (
      event_id, source_app, session_id, event_type, tool_name, summary, payload, created_at,
      run_id, agent_id, parent_event_id, task_id, duration_ms, exit_code, risk_level,
      agent_state, error_type
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    eventId,
    event.source_app,
    event.session_id,
    event.event_type,
    event.tool_name || null,
    summary,
    payloadStr,
    createdAt,
    event.run_id ?? null,
    event.agent_id ?? null,
    event.parent_event_id ?? null,
    event.task_id ?? null,
    event.duration_ms ?? null,
    event.exit_code ?? null,
    event.risk_level ?? null,
    event.agent_state ?? null,
    event.error_type ?? null
  );

  return {
    id: Number(result.lastInsertRowid),
    event_id: eventId,
    source_app: event.source_app,
    session_id: event.session_id,
    event_type: event.event_type,
    tool_name: event.tool_name ?? null,
    summary,
    payload: safePayload,
    created_at: createdAt,
    run_id: event.run_id ?? null,
    agent_id: event.agent_id ?? null,
    parent_event_id: event.parent_event_id ?? null,
    task_id: event.task_id ?? null,
    duration_ms: event.duration_ms ?? null,
    exit_code: event.exit_code ?? null,
    risk_level: event.risk_level ?? null,
    agent_state: event.agent_state ?? null,
    error_type: event.error_type ?? null,
  };
}

function rowToEvent(row: Record<string, unknown>): StoredEvent {
  return {
    id: row.id as number,
    event_id: row.event_id as string,
    source_app: row.source_app as string,
    session_id: row.session_id as string,
    event_type: row.event_type as string,
    tool_name: row.tool_name as string | null,
    summary: row.summary as string,
    payload: JSON.parse(row.payload as string),
    created_at: row.created_at as string,
    // Correlation fields
    run_id: row.run_id as string | null,
    agent_id: row.agent_id as string | null,
    parent_event_id: row.parent_event_id as string | null,
    task_id: row.task_id as string | null,
    duration_ms: row.duration_ms as number | null,
    exit_code: row.exit_code as number | null,
    risk_level: row.risk_level as 'low' | 'med' | 'high' | null,
    agent_state: row.agent_state as 'idle' | 'active' | 'waiting' | 'error' | null,
    error_type: row.error_type as string | null,
  };
}

export function getHistory(db: Database, params: HistoryParams): { events: StoredEvent[]; total: number } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.source_app) {
    conditions.push("source_app = ?");
    values.push(params.source_app);
  }
  if (params.session_id) {
    conditions.push("session_id = ?");
    values.push(params.session_id);
  }
  if (params.event_type) {
    conditions.push("event_type = ?");
    values.push(params.event_type);
  }
  if (params.since) {
    conditions.push("created_at >= ?");
    values.push(params.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM events ${where}`).get(...values) as { cnt: number };
  const total = countRow.cnt;

  const limit = Math.min(params.limit, 500);
  const rows = db
    .prepare(`SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, params.offset) as Record<string, unknown>[];

  return { events: rows.map(rowToEvent), total };
}

export function getFilters(db: Database): FiltersResponse {
  const apps = db.prepare("SELECT DISTINCT source_app FROM events ORDER BY source_app").all() as { source_app: string }[];
  const sessions = db.prepare("SELECT DISTINCT session_id FROM events ORDER BY session_id").all() as { session_id: string }[];
  const types = db.prepare("SELECT DISTINCT event_type FROM events ORDER BY event_type").all() as { event_type: string }[];

  return {
    source_apps: apps.map((r) => r.source_app),
    session_ids: sessions.map((r) => r.session_id),
    event_types: types.map((r) => r.event_type),
  };
}

export function getRecentEvents(db: Database, limit: number): StoredEvent[] {
  const rows = db
    .prepare("SELECT * FROM events ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToEvent).reverse();
}

/**
 * Get all ancestor events by walking parent_event_id chain recursively
 * Returns ancestors in root-first order (oldest ancestor first)
 */
export function getAncestors(db: Database, eventId: string): StoredEvent[] {
  const ancestors: StoredEvent[] = [];
  let currentId: string | null = eventId;
  const visited = new Set<string>();
  let depth = 0;
  const MAX_ANCESTOR_DEPTH = 25;

  // Start by getting the current event to find its parent
  const currentRow = db
    .prepare("SELECT * FROM events WHERE event_id = ?")
    .get(currentId) as Record<string, unknown> | undefined;

  if (!currentRow) return ancestors;

  const currentEvent = rowToEvent(currentRow);
  currentId = currentEvent.parent_event_id;

  // Now walk up the parent chain
  while (currentId && !visited.has(currentId) && depth < MAX_ANCESTOR_DEPTH) {
    visited.add(currentId);
    depth++;

    const row = db
      .prepare("SELECT * FROM events WHERE event_id = ?")
      .get(currentId) as Record<string, unknown> | undefined;

    if (!row) break;

    const event = rowToEvent(row);
    ancestors.unshift(event); // Add to beginning for root-first order
    currentId = event.parent_event_id;
  }

  return ancestors;
}

/**
 * Get all descendant events (children) for a given event
 * Uses run_id, agent_id, and time window for efficient querying
 */
export function getDescendants(db: Database, event: StoredEvent): StoredEvent[] {
  if (!event.run_id || !event.agent_id) {
    return [];
  }

  // Query events within ±30 minutes with same run_id and agent_id
  const timeWindow = 30 * 60 * 1000; // 30 minutes in ms
  const eventTime = new Date(event.created_at).getTime();
  const startTime = new Date(eventTime - timeWindow).toISOString();
  const endTime = new Date(eventTime + timeWindow).toISOString();

  const rows = db
    .prepare(`
      SELECT * FROM events
      WHERE run_id = ?
        AND agent_id = ?
        AND parent_event_id = ?
        AND created_at >= ?
        AND created_at <= ?
      ORDER BY created_at ASC
    `)
    .all(event.run_id, event.agent_id, event.event_id, startTime, endTime) as Record<string, unknown>[];

  return rows.map(rowToEvent);
}

/**
 * Get context events for a run within a time window around a center timestamp
 * Returns events with the same run_id (and optionally agent_id) within ±windowSec of centerTs
 */
export function getContextEvents(
  db: Database,
  runId: string,
  agentId: string | null,
  centerTs: string,
  windowSec: number = 300
): StoredEvent[] {
  const centerTime = new Date(centerTs).getTime();
  const startTime = new Date(centerTime - windowSec * 1000).toISOString();
  const endTime = new Date(centerTime + windowSec * 1000).toISOString();

  const query = agentId
    ? `SELECT * FROM events WHERE run_id = ? AND agent_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC LIMIT 200`
    : `SELECT * FROM events WHERE run_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC LIMIT 200`;

  const params = agentId
    ? [runId, agentId, startTime, endTime]
    : [runId, startTime, endTime];

  const rows = db.prepare(query).all(...params) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}

/**
 * Recursively build a tree of descendant events
 */
export function buildTraceTree(db: Database, event: StoredEvent, depth: number, maxDepth = 10): TraceNode {
  const node: TraceNode = {
    event,
    children: [],
    depth
  };

  if (depth >= maxDepth) {
    return node;
  }

  const children = getDescendants(db, event);
  node.children = children.map(child => buildTraceTree(db, child, depth + 1, maxDepth));

  return node;
}

/**
 * Get complete trace for an event: ancestors, the event itself, and descendants
 */
export function getTrace(db: Database, eventId: string): TraceResponse | null {
  const row = db
    .prepare("SELECT * FROM events WHERE event_id = ?")
    .get(eventId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  const root = rowToEvent(row);
  const ancestors = getAncestors(db, eventId);
  const descendants = getDescendants(db, root).map(child => buildTraceTree(db, child, 1));

  return {
    root,
    ancestors,
    descendants
  };
}

/**
 * Get events by category prefix (e.g. "agent" matches "agent.created", "agent.spawned", etc.)
 */
export function getEventsByCategory(db: Database, category: string, limit = 100): StoredEvent[] {
  const rows = db
    .prepare("SELECT * FROM events WHERE event_type LIKE ? ORDER BY created_at DESC LIMIT ?")
    .all(`${category}.%`, limit) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}

/**
 * Get chronological timeline of events for a specific agent
 */
export function getAgentTimeline(
  db: Database,
  agentId: string,
  since?: string,
  limit = 200
): StoredEvent[] {
  if (since) {
    const rows = db
      .prepare("SELECT * FROM events WHERE agent_id = ? AND created_at >= ? ORDER BY created_at ASC LIMIT ?")
      .all(agentId, since, limit) as Record<string, unknown>[];
    return rows.map(rowToEvent);
  }
  const rows = db
    .prepare("SELECT * FROM events WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?")
    .all(agentId, limit) as Record<string, unknown>[];
  return rows.map(rowToEvent);
}
