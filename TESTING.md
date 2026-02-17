# Testing & Multi-Agent Orchestration Guide

This document covers how to test the observability dashboard locally, stress-test it, and orchestrate multiple Claude Code agents using tmux.

## Quick Start (5 minutes)

### Single Dashboard Test

```bash
cd ~/claudeobserv
bun run setup    # Only needed once
bun run dev      # Start server (:4000) + UI (:5173)
```

Then open http://localhost:5173 and send a test event:

```bash
# In another terminal
curl -X POST http://localhost:4000/api/events \
  -H "Content-Type: application/json" \
  -d '{"source_app":"test","session_id":"abc123","event_type":"PreToolUse","tool_name":"Bash","summary":"npm test"}'
```

You should see the event appear in the dashboard within ~1 second.

---

## Testing Modes

### Mode 1: Development (HMR + Hot Reload)

**Best for:** Developing features, debugging, live UI updates

```bash
bun run dev
```

Starts two processes via `concurrently`:
- **Bun server** on port 4000 (auto-restarts on `server/*.ts` changes)
- **Vite dev server** on port 5173 (HMR for `client/src` changes)

**Dashboard URL:** http://localhost:5173
**API URL:** http://localhost:4000

The Vite dev server proxies `/api` and `/ws` to the Bun server.

### Mode 2: Production Build

**Best for:** Simulating deployment, testing static file serving, performance testing

```bash
bun run build    # Builds Vue into client/dist/
bun run start    # Single process serves everything on :4000
```

**Dashboard URL:** http://localhost:4000

Everything is self-contained in one process. No external dependencies.

---

## Manual Testing

### Test Suite: API & WebSocket

All examples assume the server is running on `http://localhost:4000`.

#### 1. Health Check

```bash
# Verify server is up and responding
curl -s http://localhost:4000/api/filters | jq .
```

Expected response:
```json
{
  "source_apps": [],
  "session_ids": [],
  "event_types": []
}
```

#### 2. Send Single Event

```bash
curl -X POST http://localhost:4000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "source_app": "my-agent",
    "session_id": "session-abc123",
    "event_type": "PreToolUse",
    "tool_name": "Bash",
    "summary": "npm test -- --coverage"
  }'
```

Expected response (201 Created):
```json
{
  "id": 1,
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "created_at": "2026-02-15T12:34:56.789Z"
}
```

#### 3. Query Events with Filters

```bash
# Get last 10 events
curl -s 'http://localhost:4000/api/history?limit=10'

# Filter by source app
curl -s 'http://localhost:4000/api/history?source_app=my-agent&limit=20'

# Filter by event type
curl -s 'http://localhost:4000/api/history?event_type=PreToolUse&limit=20'

# Combine filters
curl -s 'http://localhost:4000/api/history?source_app=my-agent&event_type=PostToolUse&limit=5'
```

#### 4. Watch WebSocket Stream (Real-time)

Install wscat (one-time):
```bash
npm install -g wscat
```

Then watch the stream:
```bash
wscat -c ws://localhost:4000/ws
```

You'll see:
- Initial snapshot: `{"type":"snapshot","events":[...]}`
- New events: `{"type":"event","event":{...}}`
- Heartbeats: `{"type":"ping","ts":"2026-02-15T12:34:56.789Z"}`

Type `{"type":"pong"}` to respond to a ping.

#### 5. Stress Test (Rapid Events)

Send 50 events rapidly and watch the LivePulse timeline animate:

```bash
#!/bin/bash
for i in {1..50}; do
  curl -s -X POST http://localhost:4000/api/events \
    -H "Content-Type: application/json" \
    -d "{
      \"source_app\": \"agent-$((RANDOM % 3 + 1))\",
      \"session_id\": \"session-$((RANDOM % 5))\",
      \"event_type\": \"$([ $((RANDOM % 2)) -eq 0 ] && echo 'PreToolUse' || echo 'PostToolUse')\",
      \"tool_name\": \"$([ $((RANDOM % 3)) -eq 0 ] && echo 'Bash' || echo 'Write')\",
      \"summary\": \"Test event #$i\"
    }" &
done
wait
```

Watch the dashboard at http://localhost:4000 — the LivePulse should spike and the stream should fill with events.

#### 6. Test Disconnection Recovery

With the dashboard open:

```bash
# Kill the server
pkill -f "bun.*server.ts"

# Watch the connection indicator turn red
# Then restart
bun run start

# Watch the indicator turn green and events resume flowing
```

---

## Multi-Agent Orchestration with tmux

### Setup

1. **Install tmux** (if not already installed):
   ```bash
   # macOS
   brew install tmux

   # Ubuntu/Debian
   sudo apt-get install tmux

   # Fedora/RHEL
   sudo dnf install tmux
   ```

2. **Make the script executable:**
   ```bash
   chmod +x ~/claudeobserv/tmux-session.sh
   ```

### Quick Start: Orchestrate 2 Agents + Dashboard

```bash
# Terminal 1: Start everything
~/claudeobserv/tmux-session.sh ~/claudeobserv ~/my-project-1 ~/my-project-2

# You'll be attached to the tmux session automatically
# Window 0 = Dashboard
# Window 1 = Agent 1
# Window 2 = Agent 2
# Window 3 = Monitor
```

### Navigate tmux

| Key | Action |
|-----|--------|
| `C-b 0` | Jump to Window 0 (Dashboard) |
| `C-b 1` | Jump to Window 1 (Agent 1) |
| `C-b 2` | Jump to Window 2 (Agent 2) |
| `C-b 3` | Jump to Window 3 (Monitor) |
| `C-b n` | Next window |
| `C-b p` | Previous window |
| `C-b [` | Enter scroll/copy mode (exit with `q`) |
| `C-b d` | Detach from session (keeps running) |

### Detach & Reattach

```bash
# Detach (keep session running)
C-b d

# List sessions
tmux list-sessions

# Reattach
tmux attach -t claudeobserv

# Kill session
tmux kill-session -t claudeobserv
```

### Workflow: Multi-Agent Testing

1. **Start session:**
   ```bash
   ~/claudeobserv/tmux-session.sh ~/claudeobserv ~/proj-1 ~/proj-2
   ```

2. **Window 1 (Agent 1):** Launch Claude Code
   ```bash
   claude-code ~/proj-1
   # Now Agent 1 will send hooks to observability server automatically
   ```

3. **Window 2 (Agent 2):** Launch Claude Code
   ```bash
   claude-code ~/proj-2
   # Agent 2 also connected
   ```

4. **Window 0 (Dashboard):** Watch real-time events from both agents
   - Green dot should show "Connected"
   - Event count increases in real-time
   - Filter dropdowns show `agent-1`, `agent-2` as source apps
   - LivePulse animates with activity

5. **Window 3 (Monitor):** Run test commands
   ```bash
   # Check which agents are active
   curl -s http://localhost:4000/api/filters | jq '.source_apps'

   # See recent events from agent-1
   curl -s 'http://localhost:4000/api/history?source_app=agent-1&limit=5' | jq '.events[] | {tool_name, summary, created_at}'
   ```

---

## Configuring Claude Code Hooks

For each Claude Code project you want to monitor, add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun \"${CLAUDEOBSERV_DIR}/hooks/send_event.ts\"",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun \"${CLAUDEOBSERV_DIR}/hooks/send_event.ts\"",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Replace `${CLAUDEOBSERV_DIR}` with the absolute path to your claudeobserv directory.

### Per-Agent Customization

Set environment variables before launching Claude Code:

```bash
export OBSERV_URL="http://localhost:4000"
export OBSERV_SOURCE="my-custom-name"
claude-code /path/to/project
```

This will label all events from that agent as `source_app: "my-custom-name"`.

---

## Performance Testing

### Baseline: Event Insertion Speed

```bash
time for i in {1..1000}; do
  curl -s -X POST http://localhost:4000/api/events \
    -H "Content-Type: application/json" \
    -d "{\"source_app\":\"benchmark\",\"session_id\":\"session-1\",\"event_type\":\"PreToolUse\",\"summary\":\"Event #$i\"}" &
done
wait
```

Expected: ~1-2 seconds for 1000 inserts (SQLite with WAL mode handles this well).

### Check Database Size

```bash
ls -lh ~/claudeobserv/events.sqlite
```

Each event is ~500-1000 bytes depending on payload size.

### Memory Usage

The Vue store prunes events when exceeding 2000, keeping memory bounded. To check:

```bash
# Open dashboard, send events, open browser DevTools (F12)
# Go to Memory tab, take heap snapshot
# Look for `events` Map size
```

---

## Debugging

### Server Logs

When running `bun run dev`:
- Logs go to stdout in the Bun server window
- Watch for errors when POST `/api/events` fails

### Client Logs

When running `bun run dev`:
- Open http://localhost:5173
- Press F12 (DevTools)
- Go to Console tab
- Watch for WebSocket errors, fetch failures, etc.

### Database Inspection

Query the SQLite database directly:

```bash
sqlite3 ~/claudeobserv/events.sqlite

# Inside sqlite3 prompt:
.mode column
SELECT source_app, event_type, tool_name, summary, created_at FROM events LIMIT 10;
.quit
```

### Clear All Data

```bash
# Stop the server first
rm ~/claudeobserv/events.sqlite*

# Restart server (will recreate fresh database)
bun run start
```

---

## Troubleshooting

### Port 4000 Already in Use

```bash
# Find process using port 4000
lsof -i :4000

# Kill it
kill -9 <PID>

# Or change port
PORT=5000 bun run start
```

### WebSocket Connection Fails

1. Check server is running: `curl http://localhost:4000/api/filters`
2. Check firewall isn't blocking port 4000
3. Check dev proxy in `client/vite.config.ts` points to correct host
4. In browser DevTools, look for WebSocket upgrade errors

### Events Not Appearing

1. Verify POST returns 201: `curl -X POST ... -w "\n%{http_code}\n"`
2. Check server is receiving them: watch server logs
3. Verify WebSocket client is connected (green dot in dashboard)
4. Check browser console for JS errors

### Hooks Not Firing

1. Verify hook script is executable: `ls -l hooks/send_event.ts`
2. Test hook manually: `echo '{"type":"PreToolUse","session_id":"test"}' | bun hooks/send_event.ts`
3. Check `.claude/settings.json` hook config is valid JSON
4. Ensure `async: true` is set (otherwise Claude Code blocks)

---

## Summary

| Task | Command |
|------|---------|
| **Dev mode (HMR)** | `bun run dev` |
| **Production build** | `bun run build && bun run start` |
| **Multi-agent tmux** | `./tmux-session.sh ~/claudeobserv ~/proj-1 ~/proj-2` |
| **Send test event** | `curl -X POST http://localhost:4000/api/events ...` |
| **Stress test** | See "Stress Test" section above |
| **Watch WebSocket** | `wscat -c ws://localhost:4000/ws` |
| **Clear database** | `rm events.sqlite*` (before restart) |
| **Debug database** | `sqlite3 events.sqlite` |

---

## Next Steps

1. **Configure hooks** in your Claude Code projects (`.claude/settings.json`)
2. **Set OBSERV_SOURCE** environment variable per agent (for custom names)
3. **Run tmux session** to orchestrate multiple agents
4. **Monitor dashboard** at http://localhost:4000 (production) or http://localhost:5173 (dev)
5. **Use filters** to isolate events by agent, session, or tool
6. **Inspect payloads** by clicking event cards to expand JSON

Happy observing! 🚀
