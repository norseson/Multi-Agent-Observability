# Multi-Agent Observability Dashboard

[![CI](https://github.com/norseson/Multi-Agent-Observability/actions/workflows/ci.yml/badge.svg)](https://github.com/norseson/Multi-Agent-Observability/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![Vue 3](https://img.shields.io/badge/frontend-Vue%203-4FC08D.svg)](https://vuejs.org)

Real-time observability dashboard for monitoring Claude Code agent activity. Captures hook events (PreToolUse, PostToolUse, Notification), persists them in SQLite, broadcasts via WebSocket, and displays in a dark-themed "hacker-noir" Vue.js UI.

![Dashboard Screenshot](https://img.shields.io/badge/status-beta-orange)

## Architecture

```
Claude Code Hooks ──▶ HTTP POST ──▶ Bun Server ──▶ SQLite
                                        │
                                        ▼
                                   WebSocket Broadcast
                                        │
                                        ▼
                                  Vue.js Dashboard
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Install & Run

```bash
# Clone the repo
git clone https://github.com/norseson/Multi-Agent-Observability.git
cd Multi-Agent-Observability

# Install all dependencies
bun run setup

# Start development (Bun server + Vite dev server)
bun run dev
```

- **Dashboard (dev):** http://localhost:5173
- **API:** http://localhost:4000

### Production Mode

```bash
bun run build    # Build Vue frontend
bun run start    # Serve everything from port 4000
```

In production, the dashboard and API are both served from **http://localhost:4000**.

## Sending Test Events

```bash
curl -X POST http://localhost:4000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "source_app": "my-project",
    "session_id": "abc123def456",
    "event_type": "PreToolUse",
    "tool_name": "Bash",
    "summary": "npm test"
  }'
```

## Connecting Claude Code Hooks

Add hook configuration to your Claude Code project's `.claude/settings.json` (or `~/.claude/settings.json` for global hooks):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun \"/path/to/Multi-Agent-Observability/hooks/send_event.ts\""
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
            "command": "bun \"/path/to/Multi-Agent-Observability/hooks/send_event.ts\""
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bun \"/path/to/Multi-Agent-Observability/hooks/send_event.ts\""
          }
        ]
      }
    ]
  }
}
```

Replace `/path/to/Multi-Agent-Observability` with the absolute path to your clone.

See `hooks/claude-hooks-config.json` for a complete example using `$CLAUDE_PROJECT_DIR`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `OBSERV_URL` | `http://localhost:4000` | Server URL (used by hook scripts) |
| `OBSERV_SOURCE` | `claude-agent` | Source app identifier |
| `OBSERV_AGENT_ID` | Same as `OBSERV_SOURCE` | Agent identifier for correlation |
| `OBSERV_RUN_ID` | `null` | Run identifier for correlation |

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/events` | POST | Ingest a new event |
| `/api/history` | GET | Query events with filters (`source_app`, `session_id`, `event_type`, `limit`, `offset`, `since`) |
| `/api/filters` | GET | Get distinct filter values |
| `/ws` | WS | Real-time event stream (snapshot + live updates) |

## Features

- **Real-time streaming** — WebSocket broadcasts events to all connected clients instantly
- **Persistent storage** — SQLite with WAL mode for concurrent access
- **Multi-agent support** — Filter and view events from multiple agents simultaneously
- **Auto-reconnect** — Client handles server restarts gracefully
- **Event deduplication** — UUID-based, prevents duplicate display
- **Secret redaction** — Sensitive data in payloads is automatically redacted
- **Auto-events** — `session.started` and `run.summary` generated automatically
- **Risk levels** — Tool calls classified by risk (low/med/high)
- **Dark theme** — "Hacker-noir" aesthetic with cyan accents
- **Live Activity Pulse** — 60-second rolling SVG timeline

## Tech Stack

- **Backend:** Bun + SQLite (`bun:sqlite`)
- **Frontend:** Vue 3 + Tailwind CSS + Vite
- **Real-time:** WebSocket (native Bun)
- **Zero production dependencies** — Single Bun executable + SQLite

## Multi-Agent Setup (tmux)

For running multiple Claude Code agents simultaneously with shared observability:

```bash
# Make executable (first time)
chmod +x tmux-session.sh

# Launch with up to 3 agent projects
./tmux-session.sh ~/Multi-Agent-Observability ~/project-1 ~/project-2
```

> **Note:** tmux is required and available on macOS/Linux. Windows users should use WSL.

See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed multi-agent instructions.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Setting up your development environment
- Code style and conventions
- Submitting pull requests

## Documentation

| File | Description |
|------|-------------|
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Complete setup from scratch, all deployment modes |
| [TESTING.md](TESTING.md) | 50+ testing examples, stress tests, debugging |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | Commands cheat sheet |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributor guidelines |

## License

[MIT](LICENSE)
