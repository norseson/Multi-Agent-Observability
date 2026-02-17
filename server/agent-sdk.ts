/**
 * Agent SDK — Lightweight TypeScript library for emitting observability events.
 *
 * Pure HTTP client with zero server dependencies.
 * Can be imported by orchestrator scripts, tmux launchers, or custom agents
 * to emit lifecycle events via POST /api/events.
 *
 * Usage:
 *   import { ObservabilitySDK } from './server/agent-sdk';
 *   const sdk = new ObservabilitySDK({
 *     sourceApp: 'orchestrator',
 *     sessionId: 'sess-123',
 *     agentId: 'agent-1',
 *   });
 *   await sdk.agentCreated('agent-1', 'coder');
 *   await sdk.runStarted('build-feature');
 */

import { EventTypes, type EventType } from './event-types';

interface SDKConfig {
  serverUrl?: string;
  sourceApp: string;
  sessionId: string;
  agentId: string;
  runId?: string;
}

interface EmitOptions {
  summary?: string;
  payload?: Record<string, unknown>;
  taskId?: string;
  parentEventId?: string;
  durationMs?: number;
  exitCode?: number;
  riskLevel?: 'low' | 'med' | 'high';
  toolName?: string;
  agentState?: 'idle' | 'active' | 'waiting' | 'error';
  errorType?: string;
}

export class ObservabilitySDK {
  private serverUrl: string;
  private sourceApp: string;
  private sessionId: string;
  private agentId: string;
  private runId: string | null;

  constructor(config: SDKConfig) {
    this.serverUrl = config.serverUrl || process.env.OBSERV_URL || 'http://localhost:4000';
    this.sourceApp = config.sourceApp;
    this.sessionId = config.sessionId;
    this.agentId = config.agentId;
    this.runId = config.runId || null;
  }

  /**
   * Core emitter — all public methods delegate here.
   * Fire-and-forget: callers should not rely on awaiting unless they need confirmation.
   */
  private async emit(eventType: EventType | string, options: EmitOptions = {}): Promise<string> {
    const eventId = crypto.randomUUID();
    const body = {
      event_id: eventId,
      source_app: this.sourceApp,
      session_id: this.sessionId,
      event_type: eventType,
      tool_name: options.toolName || null,
      summary: options.summary || null,
      payload: options.payload || {},
      timestamp: new Date().toISOString(),
      run_id: this.runId,
      agent_id: this.agentId,
      parent_event_id: options.parentEventId || null,
      task_id: options.taskId || null,
      duration_ms: options.durationMs || null,
      exit_code: options.exitCode || null,
      risk_level: options.riskLevel || null,
      agent_state: options.agentState || null,
      error_type: options.errorType || null,
    };

    // Fire-and-forget pattern (same as hooks/send_event.ts)
    fetch(`${this.serverUrl}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});

    return eventId;
  }

  // --- Mutable state ---

  setRunId(runId: string): void {
    this.runId = runId;
  }

  // --- Agent lifecycle (Tier 0) ---

  agentCreated(name: string, type?: string, parentAgentId?: string): Promise<string> {
    return this.emit(EventTypes.AGENT_CREATED, {
      summary: `Agent created: ${name}`,
      payload: { agent_name: name, agent_type: type, parent_agent_id: parentAgentId },
      agentState: 'idle',
    });
  }

  agentSpawned(childAgentId: string, childName: string): Promise<string> {
    return this.emit(EventTypes.AGENT_SPAWNED, {
      summary: `Spawned child: ${childName}`,
      payload: { child_agent_id: childAgentId, child_name: childName },
    });
  }

  agentStateChanged(previousState: string, newState: string, reason?: string): Promise<string> {
    return this.emit(EventTypes.AGENT_STATE_CHANGED, {
      summary: `State: ${previousState} → ${newState}`,
      payload: { previous_state: previousState, new_state: newState, reason },
      agentState: newState as 'idle' | 'active' | 'waiting' | 'error',
    });
  }

  agentTerminated(reason?: string, exitCode?: number): Promise<string> {
    return this.emit(EventTypes.AGENT_TERMINATED, {
      summary: `Agent terminated${reason ? ': ' + reason : ''}`,
      payload: { reason },
      exitCode,
    });
  }

  agentError(errorMessage: string, errorType?: string): Promise<string> {
    return this.emit(EventTypes.AGENT_ERROR, {
      summary: `Agent error: ${errorMessage.slice(0, 80)}`,
      payload: { error_message: errorMessage, error_type: errorType },
      riskLevel: 'high',
      agentState: 'error',
      errorType: errorType || 'agent_error',
    });
  }

  // --- Run lifecycle (Tier 0) ---

  runStarted(runName?: string, prompt?: string): Promise<string> {
    const runId = crypto.randomUUID();
    this.runId = runId;
    return this.emit(EventTypes.RUN_STARTED, {
      summary: `Run started${runName ? ': ' + runName : ''}`,
      payload: { run_name: runName, prompt: prompt?.slice(0, 200) },
    });
  }

  runCompleted(durationMs?: number): Promise<string> {
    return this.emit(EventTypes.RUN_COMPLETED, {
      summary: `Run completed${durationMs ? ' (' + durationMs + 'ms)' : ''}`,
      payload: { duration_ms: durationMs },
      durationMs,
    });
  }

  runFailed(errorMessage: string, durationMs?: number): Promise<string> {
    return this.emit(EventTypes.RUN_FAILED, {
      summary: `Run failed: ${errorMessage.slice(0, 80)}`,
      payload: { error_message: errorMessage, duration_ms: durationMs },
      durationMs,
      riskLevel: 'high',
      errorType: 'run_failure',
    });
  }

  // --- Task lifecycle (Tier 0) ---

  taskCreated(taskId: string, name: string, description?: string): Promise<string> {
    return this.emit(EventTypes.TASK_CREATED, {
      summary: `Task created: ${name}`,
      payload: { task_name: name, task_description: description },
      taskId,
    });
  }

  taskAssigned(taskId: string, assignedAgentId: string): Promise<string> {
    return this.emit(EventTypes.TASK_ASSIGNED, {
      summary: `Task assigned to ${assignedAgentId}`,
      payload: { assigned_agent_id: assignedAgentId },
      taskId,
    });
  }

  taskStarted(taskId: string): Promise<string> {
    return this.emit(EventTypes.TASK_STARTED, {
      summary: `Task started: ${taskId}`,
      taskId,
    });
  }

  taskCompleted(taskId: string, durationMs?: number): Promise<string> {
    return this.emit(EventTypes.TASK_COMPLETED, {
      summary: `Task completed: ${taskId}${durationMs ? ' (' + durationMs + 'ms)' : ''}`,
      taskId,
      durationMs,
    });
  }

  taskFailed(taskId: string, errorMessage: string): Promise<string> {
    return this.emit(EventTypes.TASK_FAILED, {
      summary: `Task failed: ${taskId}`,
      payload: { error_message: errorMessage },
      taskId,
      riskLevel: 'high',
      errorType: 'task_failure',
    });
  }

  // --- Orchestration (Tier 0) ---

  handoffInitiated(toAgentId: string, reason?: string): Promise<string> {
    return this.emit(EventTypes.HANDOFF_INITIATED, {
      summary: `Handoff to ${toAgentId}`,
      payload: { from_agent_id: this.agentId, to_agent_id: toAgentId, reason },
    });
  }

  handoffCompleted(fromAgentId: string): Promise<string> {
    return this.emit(EventTypes.HANDOFF_COMPLETED, {
      summary: `Handoff from ${fromAgentId} completed`,
      payload: { from_agent_id: fromAgentId, to_agent_id: this.agentId },
    });
  }

  delegationRequested(targetAgentId: string, taskDescription: string): Promise<string> {
    return this.emit(EventTypes.DELEGATION_REQUESTED, {
      summary: `Delegation to ${targetAgentId}: ${taskDescription.slice(0, 60)}`,
      payload: { target_agent_id: targetAgentId, task_description: taskDescription },
    });
  }

  delegationResult(taskId: string, success: boolean): Promise<string> {
    return this.emit(EventTypes.DELEGATION_RESULT, {
      summary: `Delegation ${success ? 'succeeded' : 'failed'}: ${taskId}`,
      payload: { success },
      taskId,
      riskLevel: success ? undefined : 'med',
    });
  }

  teamFormed(teamName: string, memberIds: string[]): Promise<string> {
    return this.emit(EventTypes.TEAM_FORMED, {
      summary: `Team formed: ${teamName} (${memberIds.length} members)`,
      payload: { team_name: teamName, member_ids: memberIds },
    });
  }

  teamDisbanded(teamName: string, reason?: string): Promise<string> {
    return this.emit(EventTypes.TEAM_DISBANDED, {
      summary: `Team disbanded: ${teamName}`,
      payload: { team_name: teamName, reason },
    });
  }

  // --- Error handling (Tier 0) ---

  errorOccurred(errorType: string, message: string, recoverable: boolean): Promise<string> {
    return this.emit(EventTypes.ERROR_OCCURRED, {
      summary: `Error: ${message.slice(0, 80)}`,
      payload: { error_type: errorType, error_message: message, recoverable },
      riskLevel: recoverable ? 'med' : 'high',
      errorType,
    });
  }

  errorTimeout(operation: string, timeoutMs: number): Promise<string> {
    return this.emit(EventTypes.ERROR_TIMEOUT, {
      summary: `Timeout: ${operation} (${timeoutMs}ms)`,
      payload: { operation, timeout_ms: timeoutMs },
      riskLevel: 'high',
      errorType: 'timeout',
    });
  }

  errorRecoveryAttempted(originalErrorId: string, strategy: string): Promise<string> {
    return this.emit(EventTypes.ERROR_RECOVERY_ATTEMPTED, {
      summary: `Recovery attempted: ${strategy}`,
      payload: { original_error_id: originalErrorId, strategy },
      parentEventId: originalErrorId,
    });
  }

  // --- Session lifecycle (Tier 1) ---

  sessionStarted(): Promise<string> {
    return this.emit(EventTypes.SESSION_STARTED, {
      summary: `Session started: ${this.sessionId}`,
    });
  }

  sessionEnded(durationMs?: number): Promise<string> {
    return this.emit(EventTypes.SESSION_ENDED, {
      summary: `Session ended: ${this.sessionId}`,
      payload: { duration_ms: durationMs },
      durationMs,
    });
  }

  // --- Generic emitter for custom/future events ---

  custom(eventType: string, summary: string, payload?: Record<string, unknown>): Promise<string> {
    return this.emit(eventType, { summary, payload });
  }
}
