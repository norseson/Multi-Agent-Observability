#!/usr/bin/env bun

/**
 * Claude Code Hook Script — sends hook events to the observability server.
 * Reads JSON from stdin (provided by Claude Code hooks system).
 * Designed to be silent and fire-and-forget: never blocks Claude Code.
 *
 * Usage in .claude/settings.json:
 *   "hooks": {
 *     "PreToolUse": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bun \"/path/to/claudeobserv/hooks/send_event.ts\"" }] }]
 *   }
 *
 * Environment variables:
 *   OBSERV_URL      - Server URL (default: http://localhost:4000)
 *   OBSERV_SOURCE   - Source app name (default: claude-agent)
 *   OBSERV_AGENT_ID - Agent identifier for correlation
 *   OBSERV_RUN_ID   - Run identifier for correlation
 */

const SERVER_URL = process.env.OBSERV_URL || "http://localhost:4000";
const SOURCE_APP = process.env.OBSERV_SOURCE || "claude-agent";
const AGENT_ID = process.env.OBSERV_AGENT_ID || SOURCE_APP;
const RUN_ID = process.env.OBSERV_RUN_ID || null;

try {
  const input = await Bun.stdin.text();
  const hookData = JSON.parse(input);

  // Resolve event type: Claude Code uses hook_event_name, fallback to type
  const eventType = hookData.hook_event_name || hookData.type || "unknown";

  // Extract enrichment from PostToolUse events
  let duration_ms: number | null = null;
  let exit_code: number | null = null;
  let risk_level: string | null = null;

  if (eventType === "PostToolUse") {
    if (hookData.duration_ms) duration_ms = hookData.duration_ms;
    if (hookData.tool_result?.exit_code !== undefined) {
      exit_code = hookData.tool_result.exit_code;
    }
    // Risk level by tool type
    if (hookData.tool_name === "Bash") risk_level = "med";
    if (hookData.tool_name === "Write" || hookData.tool_name === "Edit") risk_level = "low";
  }

  // Detect errors in Notification events
  if (eventType === "Notification") {
    const message = hookData.message || hookData.title || "";
    if (/error|fail|exception|timeout/i.test(message)) {
      risk_level = "med";
    }
  }

  // Build summary from tool context
  const summary = hookData.tool_name
    ? `${eventType}: ${hookData.tool_name}`
    : eventType;

  const event = {
    source_app: SOURCE_APP,
    session_id: hookData.session_id || "unknown",
    event_type: eventType,
    tool_name: hookData.tool_name || null,
    summary,
    payload: hookData,
    agent_id: AGENT_ID,
    run_id: RUN_ID,
    duration_ms,
    exit_code,
    risk_level,
  };

  await fetch(`${SERVER_URL}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  // Auto-emit tool.error on non-zero exit codes
  if (exit_code !== null && exit_code !== 0) {
    const errorEvent = {
      source_app: SOURCE_APP,
      session_id: hookData.session_id || "unknown",
      event_type: "tool.error",
      tool_name: hookData.tool_name || null,
      summary: `Tool error: ${hookData.tool_name || "unknown"} exited ${exit_code}`,
      payload: { original_event_type: eventType, exit_code },
      agent_id: AGENT_ID,
      run_id: RUN_ID,
      exit_code,
      risk_level: "high",
      error_type: "tool_error",
    };
    fetch(`${SERVER_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorEvent),
    }).catch(() => {}); // Fire-and-forget: don't block on error event delivery
  }
} catch {
  // Silent failure: hooks must never block or disrupt Claude Code
}

process.exit(0);
