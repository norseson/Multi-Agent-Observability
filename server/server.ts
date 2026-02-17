import { initDb, insertEvent, getHistory, getFilters, getRecentEvents, getTrace, getContextEvents, getEventsByCategory, getAgentTimeline } from "./db";
import type { IncomingEvent, StoredEvent } from "./types";
import { generateRunSummary } from "./summary";
import { processAutoEvents, startSessionTimeoutChecker } from "./auto-events";
import { resolve, join } from "path";

const PORT = Number(process.env.PORT) || 4000;
const STATIC_DIR = resolve(import.meta.dir, "../client/dist");

const db = initDb();

// Start session timeout checker (emits session.ended for inactive sessions)
startSessionTimeoutChecker(db, (evt) => {
  try {
    const stored = insertEvent(db, evt);
    broadcast(stored);
  } catch (e) {
    console.error("Session timeout event failed:", e);
  }
});

const clients = new Set<unknown>();

function broadcast(event: StoredEvent) {
  const msg = JSON.stringify({ type: "event", event });
  for (const ws of clients) {
    try {
      (ws as any).send(msg);
    } catch {}
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

const server = Bun.serve({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (server.upgrade(req)) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // POST /api/events
    if (url.pathname === "/api/events" && req.method === "POST") {
      return (async () => {
        try {
          const body = (await req.json()) as IncomingEvent;

          if (!body.session_id || !body.event_type) {
            return jsonResponse({ error: "session_id and event_type are required" }, 400);
          }

          const stored = insertEvent(db, body);
          broadcast(stored);

          // Process auto-event generation (session boundaries, error patterns, etc.)
          const autoEvents = processAutoEvents(db, stored);
          for (const autoEvt of autoEvents) {
            try {
              const storedAuto = insertEvent(db, autoEvt);
              broadcast(storedAuto);
            } catch (e) {
              console.error("Auto-event insertion failed:", e);
            }
          }

          // Auto-generate run.summary when run.end is received
          if (stored.event_type === "run.end" && stored.run_id && stored.agent_id) {
            try {
              const exists = db
                .prepare("SELECT 1 FROM events WHERE run_id = ? AND agent_id = ? AND event_type = 'run.summary' LIMIT 1")
                .get(stored.run_id, stored.agent_id);
              if (!exists) {
                const summaryEvt = generateRunSummary(db, stored.run_id, stored.agent_id);
                const storedSummary = insertEvent(db, summaryEvt);
                broadcast(storedSummary);
              }
            } catch (e) {
              console.error("run.summary generation failed:", e);
            }
          }

          return jsonResponse({ id: stored.id, event_id: stored.event_id, created_at: stored.created_at }, 201);
        } catch (e: any) {
          if (e?.message?.includes("UNIQUE constraint")) {
            return jsonResponse({ error: "Duplicate event_id" }, 409);
          }
          return jsonResponse({ error: e?.message || "Internal error" }, 500);
        }
      })();
    }

    // GET /api/history
    if (url.pathname === "/api/history" && req.method === "GET") {
      const params = {
        limit: Number(url.searchParams.get("limit")) || 100,
        offset: Number(url.searchParams.get("offset")) || 0,
        source_app: url.searchParams.get("source_app") || undefined,
        session_id: url.searchParams.get("session_id") || undefined,
        event_type: url.searchParams.get("event_type") || undefined,
        since: url.searchParams.get("since") || undefined,
      };
      const result = getHistory(db, params);
      const filters = getFilters(db);
      return jsonResponse({ ...result, filters });
    }

    // GET /api/filters
    if (url.pathname === "/api/filters" && req.method === "GET") {
      return jsonResponse(getFilters(db));
    }

    // GET /api/trace/:id
    if (url.pathname.startsWith("/api/trace/") && req.method === "GET") {
      const eventId = url.pathname.split("/")[3];
      if (!eventId) {
        return jsonResponse({ error: "Event ID required" }, 400);
      }

      const trace = getTrace(db, eventId);
      if (!trace) {
        return jsonResponse({ error: "Event not found" }, 404);
      }

      return jsonResponse(trace);
    }

    // GET /api/events/context
    if (url.pathname === "/api/events/context" && req.method === "GET") {
      const runId = url.searchParams.get("run_id");
      const ts = url.searchParams.get("ts");
      if (!runId || !ts) {
        return jsonResponse({ error: "run_id and ts required" }, 400);
      }
      const agentId = url.searchParams.get("agent_id") || null;
      const windowSec = Math.min(Math.max(Number(url.searchParams.get("window_sec")) || 300, 60), 600);
      return jsonResponse({ events: getContextEvents(db, runId, agentId, ts, windowSec) });
    }

    // GET /api/agents/:agentId/timeline
    if (url.pathname.startsWith("/api/agents/") && url.pathname.endsWith("/timeline") && req.method === "GET") {
      const parts = url.pathname.split("/");
      const agentId = parts[3];
      if (!agentId) {
        return jsonResponse({ error: "Agent ID required" }, 400);
      }
      const since = url.searchParams.get("since") || undefined;
      const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
      return jsonResponse({ events: getAgentTimeline(db, agentId, since, limit) });
    }

    // GET /api/events/category/:category
    if (url.pathname.startsWith("/api/events/category/") && req.method === "GET") {
      const category = url.pathname.split("/")[4];
      if (!category) {
        return jsonResponse({ error: "Category required" }, 400);
      }
      const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
      return jsonResponse({ events: getEventsByCategory(db, category, limit) });
    }

    // Static file serving (production)
    try {
      const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
      const fullPath = join(STATIC_DIR, filePath);
      const file = Bun.file(fullPath);
      if (file.size > 0) {
        return new Response(file);
      }
    } catch {}

    // SPA fallback
    try {
      const indexFile = Bun.file(join(STATIC_DIR, "index.html"));
      if (indexFile.size > 0) {
        return new Response(indexFile);
      }
    } catch {}

    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(ws) {
      clients.add(ws);
      const recent = getRecentEvents(db, 50);
      ws.send(JSON.stringify({ type: "snapshot", events: recent }));
    },
    message(ws, message) {
      // Handle pong or ignore
      try {
        const data = JSON.parse(String(message));
        if (data.type === "pong") return;
      } catch {}
    },
    close(ws) {
      clients.delete(ws);
    },
  },
});

// Heartbeat
setInterval(() => {
  const msg = JSON.stringify({ type: "ping", ts: new Date().toISOString() });
  for (const ws of clients) {
    try {
      (ws as any).send(msg);
    } catch {}
  }
}, 30_000);

console.log(`Multi-Agent Observability server running on http://localhost:${PORT}`);
