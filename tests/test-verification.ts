#!/usr/bin/env bun

/**
 * Verification test suite for Multi-Agent Observability Event Model
 * Run: bun test-verification.ts
 */

const BASE = "http://localhost:4000";
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function post(data: Record<string, unknown>) {
  const resp = await fetch(`${BASE}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return resp.json() as Promise<{ id: number; event_id: string; created_at: string }>;
}

async function getHistory(params: string) {
  const resp = await fetch(`${BASE}/api/history?${params}`);
  return resp.json() as Promise<{ events: any[]; total: number }>;
}

// ==========================================
// Test 1: Schema Migration
// ==========================================
console.log("\n=== Test 1: Schema Migration ===");
{
  const res = await post({
    source_app: "test",
    session_id: "test-schema",
    event_type: "test.schema",
    agent_state: "active",
    error_type: "test_error",
  });
  assert(!!res.event_id, "Event inserted with event_id");

  const hist = await getHistory("limit=1&event_type=test.schema");
  const e = hist.events[0];
  assert(e.agent_state === "active", "agent_state persisted: active");
  assert(e.error_type === "test_error", "error_type persisted: test_error");
  assert("agent_state" in e, "agent_state field exists in response");
  assert("error_type" in e, "error_type field exists in response");
}

// ==========================================
// Test 2: Correlation Fields
// ==========================================
console.log("\n=== Test 2: Correlation Fields ===");
{
  await post({
    source_app: "test",
    session_id: "test-corr",
    event_type: "PostToolUse",
    tool_name: "Bash",
    agent_id: "agent-X",
    run_id: "run-789",
    duration_ms: 1200,
    exit_code: 0,
    risk_level: "med",
  });

  const hist = await getHistory("limit=1&session_id=test-corr&event_type=PostToolUse");
  const e = hist.events[0];
  assert(e.agent_id === "agent-X", "agent_id: agent-X");
  assert(e.run_id === "run-789", "run_id: run-789");
  assert(e.duration_ms === 1200, `duration_ms: ${e.duration_ms} (expect 1200)`);
  assert(e.exit_code === 0, `exit_code: ${e.exit_code} (expect 0)`);
  assert(e.risk_level === "med", "risk_level: med");
}

// ==========================================
// Test 3: Agent SDK
// ==========================================
console.log("\n=== Test 3: Agent SDK ===");
{
  const { ObservabilitySDK } = await import("../server/agent-sdk");
  const sdk = new ObservabilitySDK({
    sourceApp: "sdk-test",
    sessionId: "sdk-session",
    agentId: "sdk-agent-1",
  });

  await sdk.agentCreated("test-agent", "coder");
  await sdk.runStarted("test-run");
  await sdk.taskCreated("t1", "Test task", "A test task description");
  await sdk.taskCompleted("t1", 500);
  await sdk.runCompleted(2000);

  // Wait for events to arrive
  await new Promise((r) => setTimeout(r, 500));

  const hist = await getHistory("limit=20&source_app=sdk-test");
  assert(hist.events.length >= 5, `SDK emitted ${hist.events.length} events (expect ≥5)`);

  const types = hist.events.map((e: any) => e.event_type);
  assert(types.includes("agent.created"), "agent.created emitted");
  assert(types.includes("run.started"), "run.started emitted");
  assert(types.includes("task.created"), "task.created emitted");
  assert(types.includes("task.completed"), "task.completed emitted");
  assert(types.includes("run.completed"), "run.completed emitted");

  // Check correlation
  const agentEvt = hist.events.find((e: any) => e.event_type === "agent.created");
  assert(agentEvt.agent_id === "sdk-agent-1", "SDK agent_id set correctly");
  assert(agentEvt.source_app === "sdk-test", "SDK source_app set correctly");
}

// ==========================================
// Test 4: Auto-Events
// ==========================================
console.log("\n=== Test 4: Auto-Events ===");
{
  // 4a: Session boundary detection
  await post({
    source_app: "auto-test",
    session_id: "auto-session-1",
    event_type: "PreToolUse",
    agent_id: "auto-agent",
  });
  await new Promise((r) => setTimeout(r, 300));

  const hist = await getHistory("limit=10&source_app=auto-events&session_id=auto-session-1");
  const sessionStarted = hist.events.find((e: any) => e.event_type === "session.started");
  assert(!!sessionStarted, "session.started auto-generated for new session");

  // 4b: Tool timeout detection
  await post({
    source_app: "auto-test",
    session_id: "auto-session-2",
    event_type: "PostToolUse",
    tool_name: "Bash",
    duration_ms: 45000,
    agent_id: "timeout-agent",
  });
  await new Promise((r) => setTimeout(r, 300));

  const hist2 = await getHistory("limit=10&source_app=auto-events&session_id=auto-session-2");
  const toolTimeout = hist2.events.find((e: any) => e.event_type === "tool.timeout");
  assert(!!toolTimeout, "tool.timeout auto-generated for duration > 30000ms");
  if (toolTimeout) {
    assert(toolTimeout.risk_level === "high", "tool.timeout has risk_level: high");
  }
}

// ==========================================
// Test 5: New API Routes
// ==========================================
console.log("\n=== Test 5: New API Routes ===");
{
  // Test agents timeline
  const timeResp = await fetch(`${BASE}/api/agents/sdk-agent-1/timeline`);
  const timeData = (await timeResp.json()) as { events: any[] };
  assert(timeResp.ok, "GET /api/agents/:agentId/timeline responds OK");
  assert(timeData.events.length >= 1, `Agent timeline has ${timeData.events.length} events`);

  // Test events by category
  const catResp = await fetch(`${BASE}/api/events/category/agent`);
  const catData = (await catResp.json()) as { events: any[] };
  assert(catResp.ok, "GET /api/events/category/agent responds OK");
  assert(catData.events.length >= 1, `Agent category has ${catData.events.length} events`);

  const taskCatResp = await fetch(`${BASE}/api/events/category/task`);
  const taskCatData = (await taskCatResp.json()) as { events: any[] };
  assert(taskCatResp.ok, "GET /api/events/category/task responds OK");
  assert(taskCatData.events.length >= 1, `Task category has ${taskCatData.events.length} events`);

  const sessionCatResp = await fetch(`${BASE}/api/events/category/session`);
  const sessionCatData = (await sessionCatResp.json()) as { events: any[] };
  assert(sessionCatResp.ok, "GET /api/events/category/session responds OK");
  assert(sessionCatData.events.length >= 1, `Session category has ${sessionCatData.events.length} events`);
}

// ==========================================
// Test 6: Enhanced Run Summary
// ==========================================
console.log("\n=== Test 6: Enhanced Run Summary ===");
{
  const runId = "summary-run-" + Date.now();
  const agentId = "summary-agent";

  // Emit a sequence of events
  await post({ source_app: agentId, session_id: "summary-session", event_type: "run.started", agent_id: agentId, run_id: runId });
  await post({ source_app: agentId, session_id: "summary-session", event_type: "task.completed", agent_id: agentId, run_id: runId, task_id: "t1" });
  await post({ source_app: agentId, session_id: "summary-session", event_type: "task.failed", agent_id: agentId, run_id: runId, task_id: "t2", error_type: "timeout" });
  await post({ source_app: agentId, session_id: "summary-session", event_type: "handoff.completed", agent_id: agentId, run_id: runId });
  await post({ source_app: agentId, session_id: "summary-session", event_type: "PostToolUse", tool_name: "Bash", agent_id: agentId, run_id: runId, exit_code: 0 });

  // Trigger run.end → auto-generates run.summary
  await post({ source_app: agentId, session_id: "summary-session", event_type: "run.end", agent_id: agentId, run_id: runId });
  await new Promise((r) => setTimeout(r, 500));

  const hist = await getHistory("limit=1&event_type=run.summary&session_id=summary-session");
  const summary = hist.events[0];
  assert(!!summary, "run.summary auto-generated");
  if (summary) {
    const p = summary.payload;
    assert(Array.isArray(p.agents_involved), "agents_involved is array");
    assert(typeof p.tasks_completed === "number", `tasks_completed: ${p.tasks_completed}`);
    assert(typeof p.tasks_failed === "number", `tasks_failed: ${p.tasks_failed}`);
    assert(typeof p.handoffs === "number", `handoffs: ${p.handoffs}`);
    assert(typeof p.event_type_counts === "object", "event_type_counts present");
    assert(p.tasks_completed >= 1, `tasks_completed >= 1 (got ${p.tasks_completed})`);
    assert(p.handoffs >= 1, `handoffs >= 1 (got ${p.handoffs})`);
    assert(summary.summary.includes("agent"), `Summary text includes agent count`);
    assert(summary.summary.includes("handoff"), `Summary text includes handoff count`);
  }
}

// ==========================================
// Summary
// ==========================================
console.log("\n============================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log("============================================");

if (failed > 0) {
  process.exit(1);
}
