# Contributing to Multi-Agent Observability Dashboard

Thank you for your interest in contributing! This guide will help you get set up and productive quickly.

## Prerequisites

- [Bun](https://bun.sh) v1.0+ (runtime, package manager, and bundler)
- [Node.js](https://nodejs.org) v18+ (optional, for npm compatibility)
- A modern browser (Chrome, Firefox, Safari, Edge)

## Getting Started

```bash
# 1. Fork and clone the repo
git clone https://github.com/<your-username>/Multi-Agent-Observability.git
cd Multi-Agent-Observability

# 2. Install dependencies
bun install
cd client && bun install && cd ..

# 3. Start development mode (backend + frontend with HMR)
bun run dev

# 4. Open the dashboard
# Dev UI:  http://localhost:5173
# API:     http://localhost:4000
```

## Project Structure

```
server/           Bun HTTP API + WebSocket + SQLite
  server.ts       Main server (routes, WS, static serving)
  db.ts           Database operations & schema
  types.ts        Shared TypeScript interfaces
  redaction.ts    Payload redaction for sensitive data
  auto-events.ts  Auto-generated events (session.started, run.summary)
  agent-sdk.ts    Programmatic SDK for emitting events

client/           Vue 3 + Tailwind CSS + Vite
  src/App.vue                Root component
  src/components/            EventCard, EventStream, FilterBar, LivePulse
  src/stores/events.ts       Reactive event store
  src/composables/           WebSocket connection handler
  src/utils/                 Formatting utilities

hooks/            Claude Code integration
  send_event.ts   Hook script (reads stdin, POSTs to server)
  send_event.sh   Bash wrapper alternative

tests/            Verification tests
```

## Development Workflow

### Running the Stack

```bash
bun run dev       # Concurrent: Bun server (4000) + Vite dev (5173)
bun run start     # Production: single process on port 4000
bun run build     # Build Vue frontend to client/dist/
```

### Sending Test Events

```bash
curl -X POST http://localhost:4000/api/events \
  -H "Content-Type: application/json" \
  -d '{"source_app":"test","session_id":"s1","event_type":"PreToolUse","tool_name":"Bash","summary":"echo hello"}'
```

### Running Tests

```bash
bun run tests/test-verification.ts
```

## Code Style

- **TypeScript** for all server and hook code
- **Vue 3 Composition API** with `<script setup>` for components
- **2-space indentation** throughout
- **snake_case** for database fields and API payloads
- **camelCase** for JavaScript/TypeScript variables and functions
- **No semicolons** in Vue SFC `<script>` blocks (follows Vue convention)
- **Semicolons** in server TypeScript files

## Making Changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** — keep commits focused and atomic

3. **Test locally:**
   - Start with `bun run dev`
   - Send test events via curl
   - Verify the dashboard renders correctly
   - Run `bun run tests/test-verification.ts` if touching server/API code

4. **Build check:**
   ```bash
   bun run build  # Ensure frontend builds cleanly
   ```

5. **Open a PR** against `main` with a clear description of what and why

## What to Contribute

### Good First Issues
- Improve mobile responsiveness of dashboard components
- Add more event type color mappings in `client/src/utils/format.ts`
- Add keyboard shortcuts for filter navigation
- Write additional test cases

### Feature Ideas
- Event search/full-text filtering
- Export events to JSON/CSV
- Agent timeline visualization
- Dark/light theme toggle
- Docker support (`Dockerfile` + `docker-compose.yml`)
- Notification sounds for error events

### Bug Reports
When filing a bug, please include:
- Bun version (`bun --version`)
- OS and browser
- Steps to reproduce
- Expected vs actual behavior
- Console/server logs if applicable

## Architecture Decisions

- **Bun-native:** We use `bun:sqlite` and Bun's built-in HTTP/WebSocket server. No Express, no external DB drivers.
- **Fire-and-forget hooks:** `hooks/send_event.ts` must never block Claude Code. All errors are silently swallowed.
- **No auth (by design):** This is a local dev tool. PRs adding optional auth are welcome, but it must remain zero-config for local use.
- **SQLite WAL mode:** Allows concurrent reads during writes. The DB auto-creates on first run.

## Environment Variables

| Variable | Default | Used By |
|----------|---------|---------|
| `PORT` | `4000` | Server |
| `OBSERV_URL` | `http://localhost:4000` | Hook scripts |
| `OBSERV_SOURCE` | `claude-agent` | Hook scripts |
| `OBSERV_AGENT_ID` | Same as `OBSERV_SOURCE` | Hook scripts |
| `OBSERV_RUN_ID` | `null` | Hook scripts |

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
