# Quick Reference — Testing & Orchestration

## ⚡ 30-Second Start

```bash
cd ~/claudeobserv
bun run dev                    # Terminal 1: Dashboard + API
curl -X POST http://localhost:4000/api/events \
  -H 'Content-Type: application/json' \
  -d '{"source_app":"test","session_id":"s1","event_type":"PreToolUse"}'  # Terminal 2
# Open http://localhost:5173 in browser → See event appear instantly
```

---

## 🚀 Common Commands

### Start Dashboard

```bash
# Development (HMR, faster reload)
bun run dev

# Production (single process, :4000)
bun run build && bun run start

# Custom port
PORT=3000 bun run start
```

### Send Test Events

```bash
# Single event
curl -X POST http://localhost:4000/api/events \
  -H 'Content-Type: application/json' \
  -d '{"source_app":"agent-1","session_id":"s1","event_type":"PreToolUse","tool_name":"Bash","summary":"npm test"}'

# Rapid 20x (stress test)
for i in {1..20}; do curl -s -X POST http://localhost:4000/api/events -H 'Content-Type: application/json' -d "{\"source_app\":\"agent-$((RANDOM%3+1))\",\"session_id\":\"sess-$RANDOM\",\"event_type\":\"PreToolUse\"}" & done; wait

# From pipe (simulate hook)
echo '{"source_app":"test","session_id":"s1","event_type":"PreToolUse"}' | bun hooks/send_event.ts
```

### Query API

```bash
# Get filters
curl -s http://localhost:4000/api/filters | jq .

# Get history (last 20)
curl -s 'http://localhost:4000/api/history?limit=20' | jq .

# Filter by source
curl -s 'http://localhost:4000/api/history?source_app=agent-1' | jq '.events[] | {event_type, tool_name, summary}'

# Filter by type
curl -s 'http://localhost:4000/api/history?event_type=PreToolUse&limit=10' | jq .
```

### Watch WebSocket

```bash
# Install wscat (one-time)
npm install -g wscat

# Watch live events
wscat -c ws://localhost:4000/ws
```

---

## 🎭 Multi-Agent with tmux

### Start Session

```bash
# Basic (no agent paths)
./tmux-session.sh

# With agent projects
./tmux-session.sh ~/claudeobserv ~/proj-1 ~/proj-2

# Full setup with 3 agents
./tmux-session.sh ~/claudeobserv ~/proj-1 ~/proj-2 ~/proj-3
```

### Navigate tmux

| Key | Action |
|-----|--------|
| `C-b 0` | Window 0 (Dashboard) |
| `C-b 1` | Window 1 (Agent 1) |
| `C-b 2` | Window 2 (Agent 2) |
| `C-b 3` | Window 3 (Monitor) |
| `C-b d` | Detach (keeps running) |
| `C-b [` | Scroll mode |

### Manage Sessions

```bash
tmux list-sessions              # Show all
tmux attach -t claudeobserv     # Reconnect
tmux kill-session -t claudeobserv  # Stop
```

---

## 🔧 Configuration

### Claude Code Hooks (.claude/settings.json)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun \"/path/to/claudeobserv/hooks/send_event.ts\"",
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
            "command": "bun \"/path/to/claudeobserv/hooks/send_event.ts\"",
            "async": true,
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### Environment Variables

```bash
export OBSERV_URL="http://localhost:4000"    # Server URL
export OBSERV_SOURCE="my-agent-name"         # Identifier for this agent
claude-code /path/to/project
```

---

## 📊 Dashboard URLs

| Mode | URL |
|------|-----|
| Development | http://localhost:5173 |
| Production | http://localhost:4000 |

---

## 🧪 Health Checks

```bash
# Server alive?
curl -s http://localhost:4000/api/filters

# WebSocket working?
wscat -c ws://localhost:4000/ws

# Database okay?
ls -lh ~/claudeobserv/events.sqlite

# Process running?
ps aux | grep "bun.*server"
```

---

## 🔴 Debugging

```bash
# Clear all data (stop server first!)
rm ~/claudeobserv/events.sqlite*

# View database directly
sqlite3 ~/claudeobserv/events.sqlite "SELECT * FROM events LIMIT 5;"

# Check port in use
lsof -i :4000

# Kill process on port
kill -9 <PID>

# Test hook manually
echo '{"type":"PreToolUse","session_id":"test"}' | bun hooks/send_event.ts

# Watch server logs (in bun run dev output)
# Press Ctrl+C to stop
```

---

## 📈 Performance Benchmarks

```bash
# 1000 events in ~1-2s
time for i in {1..1000}; do curl -s -X POST http://localhost:4000/api/events -H 'Content-Type: application/json' -d "{\"source_app\":\"bench\",\"session_id\":\"s1\",\"event_type\":\"PreToolUse\"}" & done; wait

# Database size per 1000 events
ls -lh ~/claudeobserv/events.sqlite  # ~500KB-1MB

# Memory (Vue store prunes at 2000 events)
# DevTools → Memory → Heap snapshot
```

---

## 💡 Tips

- **Colorize JSON:** Pipe output to `| jq .` (requires jq)
- **Pretty timestamps:** Use `| jq '.events[] | .created_at'` to see all timestamps
- **Filter multiple agents:** `?source_app=agent-1&event_type=PreToolUse`
- **Large payloads:** Click event cards in dashboard to expand JSON
- **Reconnection:** If connection drops, dashboard auto-reconnects with backoff
- **Detached session:** Press `C-b d`, then `tmux attach -t claudeobserv` later

---

## 🆘 Issues

| Problem | Solution |
|---------|----------|
| Port 4000 in use | `lsof -i :4000` then `kill -9 <PID>` or `PORT=5000 bun run start` |
| WebSocket won't connect | Restart server, check firewall, verify dev proxy config |
| Events not appearing | Check POST returns 201, verify server logs, check console for JS errors |
| Hook not firing | Ensure `async: true` in settings, test manually with echo pipe |
| Database locked | Restart server, or delete `.sqlite-wal` and `-shm` files |

---

Generated for Multi-Agent Observability Dashboard v1.0
