#!/bin/bash

##############################################################################
# Multi-Agent Observability Dashboard — tmux Session Orchestrator
#
# This script sets up a tmux session with:
#   - Window 0: Observability Dashboard (Bun server)
#   - Window 1: Claude Code Agent 1
#   - Window 2: Claude Code Agent 2
#   - Window 3: Monitor Shell (testing, curl, wscat, logs)
#
# Usage:
#   ./tmux-session.sh [PROJECT_DIR] [AGENT_1_DIR] [AGENT_2_DIR]
#
# Defaults (if not provided):
#   - PROJECT_DIR: current directory (assumed to be claudeobserv/)
#   - AGENT_1_DIR: sibling directory named "project-1"
#   - AGENT_2_DIR: sibling directory named "project-2"
#
# Example:
#   ./tmux-session.sh ~/claudeobserv ~/my-project-1 ~/my-project-2
#
##############################################################################

set -e

SESSION="claudeobserv"
PROJECT_DIR="${1:-.}"
AGENT_1_DIR="${2:- }"
AGENT_2_DIR="${3:- }"

# Resolve to absolute paths
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

echo "🚀 Launching Multi-Agent Observability Session..."
echo ""
echo "Session name: $SESSION"
echo "Project dir: $PROJECT_DIR"
echo ""

# Kill existing session
echo "⏹️  Stopping existing session (if any)..."
tmux kill-session -t $SESSION 2>/dev/null || true

# Create new session (detached)
echo "📦 Creating new tmux session..."
tmux new-session -d -s $SESSION -x 220 -y 60

###############################################################################
# Window 0: Observability Dashboard
###############################################################################
tmux new-window -t $SESSION:0 -n "dashboard"
tmux send-keys -t $SESSION:0 "cd '$PROJECT_DIR' && echo '📊 Building dashboard...' && bun run build" Enter
tmux send-keys -t $SESSION:0 "bun run start" Enter

echo "✓ Window 0 (dashboard): Starting Bun server on :4000"

###############################################################################
# Window 1: Claude Code Agent 1
###############################################################################
if [ -n "$AGENT_1_DIR" ] && [ "$AGENT_1_DIR" != " " ]; then
  tmux new-window -t $SESSION:1 -n "agent-1"
  tmux send-keys -t $SESSION:1 "cd '$AGENT_1_DIR'" Enter
  tmux send-keys -t $SESSION:1 "export OBSERV_URL='http://localhost:4000'" Enter
  tmux send-keys -t $SESSION:1 "export OBSERV_SOURCE='agent-1'" Enter
  tmux send-keys -t $SESSION:1 "echo '🤖 Agent 1 ready. Run: claude-code' && bash" Enter
  echo "✓ Window 1 (agent-1): Ready at $AGENT_1_DIR"
else
  tmux new-window -t $SESSION:1 -n "agent-1"
  tmux send-keys -t $SESSION:1 "echo '⚠️  Agent 1 directory not provided. Specify: ./tmux-session.sh /path/to/claudeobserv /path/to/project-1'" Enter
  echo "⚠️  Window 1 (agent-1): Waiting for directory setup"
fi

###############################################################################
# Window 2: Claude Code Agent 2
###############################################################################
if [ -n "$AGENT_2_DIR" ] && [ "$AGENT_2_DIR" != " " ]; then
  tmux new-window -t $SESSION:2 -n "agent-2"
  tmux send-keys -t $SESSION:2 "cd '$AGENT_2_DIR'" Enter
  tmux send-keys -t $SESSION:2 "export OBSERV_URL='http://localhost:4000'" Enter
  tmux send-keys -t $SESSION:2 "export OBSERV_SOURCE='agent-2'" Enter
  tmux send-keys -t $SESSION:2 "echo '🤖 Agent 2 ready. Run: claude-code' && bash" Enter
  echo "✓ Window 2 (agent-2): Ready at $AGENT_2_DIR"
else
  tmux new-window -t $SESSION:2 -n "agent-2"
  tmux send-keys -t $SESSION:2 "echo '⚠️  Agent 2 directory not provided. Specify: ./tmux-session.sh /path/to/claudeobserv /path/to/project-1 /path/to/project-2'" Enter
  echo "⚠️  Window 2 (agent-2): Waiting for directory setup"
fi

###############################################################################
# Window 3: Monitor & Testing
###############################################################################
tmux new-window -t $SESSION:3 -n "monitor"
tmux send-keys -t $SESSION:3 "cd '$PROJECT_DIR'" Enter
tmux send-keys -t $SESSION:3 "cat << 'EOF'

🔍 MONITOR WINDOW — Testing & Debugging

📋 Common Commands:

  # Test API (send single event)
  curl -X POST http://localhost:4000/api/events \\
    -H 'Content-Type: application/json' \\
    -d '{\"source_app\":\"test\",\"session_id\":\"sess-123\",\"event_type\":\"PreToolUse\",\"tool_name\":\"Bash\"}'

  # Rapid-fire stress test (20 events)
  for i in {1..20}; do curl -s -X POST http://localhost:4000/api/events -H 'Content-Type: application/json' -d \"{\\\"source_app\\\":\\\"agent-\$((RANDOM % 3 + 1))\\\",\\\"session_id\\\":\\\"sess-\$RANDOM\\\",\\\"event_type\\\":\\\"PreToolUse\\\",\\\"tool_name\\\":\\\"Bash\\\"}\" & done; wait

  # Check filters
  curl -s http://localhost:4000/api/filters | jq .

  # Query history
  curl -s 'http://localhost:4000/api/history?limit=20' | jq '.events[] | {source_app, event_type, tool_name, summary}'

  # Watch WebSocket (needs: npm i -g wscat)
  wscat -c ws://localhost:4000/ws

🎯 tmux Navigation:
  C-b d         Detach session
  C-b [         Scroll mode
  C-b 0-3       Jump to window
  C-b n / C-b p Next / Previous window

📊 Open Dashboard:
  http://localhost:4000

EOF
" Enter
echo "✓ Window 3 (monitor): Testing shell ready"

# Wait a moment for servers to start
sleep 3

# Select dashboard window as default
tmux select-window -t $SESSION:0

echo ""
echo "✅ Session ready!"
echo ""
echo "📌 To manage this session:"
echo "   Attach:        tmux attach -t $SESSION"
echo "   Detach:        C-b d"
echo "   Kill:          tmux kill-session -t $SESSION"
echo "   List windows:  tmux list-windows -t $SESSION"
echo ""
echo "🌐 Dashboard: http://localhost:4000"
echo ""

# Attach session
tmux attach-session -t $SESSION
