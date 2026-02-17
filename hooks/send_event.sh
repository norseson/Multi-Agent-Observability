#!/bin/bash
# Bash wrapper for send_event.ts hook script.
# Resolves path relative to this script's location.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bun "$SCRIPT_DIR/send_event.ts" 2>/dev/null
