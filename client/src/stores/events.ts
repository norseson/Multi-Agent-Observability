import { reactive, computed } from "vue";

export interface StoredEvent {
  id: number;
  event_id: string;
  source_app: string;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  summary: string;
  payload: Record<string, unknown>;
  created_at: string;

  // Correlation fields for ops layer
  run_id: string | null;
  agent_id: string | null;
  parent_event_id: string | null;
  task_id: string | null;
  duration_ms: number | null;
  exit_code: number | null;
  risk_level: 'low' | 'med' | 'high' | null;
}

interface Filters {
  source_app: string | null;
  session_id: string | null;
  event_type: string | null;
}

const MAX_EVENTS = 2000;
const PRUNE_AMOUNT = 500;

const state = reactive({
  events: new Map<string, StoredEvent>(),
  connected: false,
  filters: {
    source_app: null,
    session_id: null,
    event_type: null,
  } as Filters,
});

function pruneIfNeeded() {
  if (state.events.size > MAX_EVENTS) {
    const sorted = [...state.events.entries()].sort(
      (a, b) => new Date(a[1].created_at).getTime() - new Date(b[1].created_at).getTime()
    );
    for (let i = 0; i < PRUNE_AMOUNT; i++) {
      state.events.delete(sorted[i][0]);
    }
  }
}

export function useEventStore() {
  const sortedEvents = computed(() =>
    [...state.events.values()].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  );

  const filteredEvents = computed(() =>
    sortedEvents.value.filter((e) => {
      if (state.filters.source_app && e.source_app !== state.filters.source_app) return false;
      if (state.filters.session_id && e.session_id !== state.filters.session_id) return false;
      if (state.filters.event_type && e.event_type !== state.filters.event_type) return false;
      return true;
    })
  );

  const filterOptions = computed(() => {
    const apps = new Set<string>();
    const sessions = new Set<string>();
    const types = new Set<string>();
    for (const e of state.events.values()) {
      apps.add(e.source_app);
      sessions.add(e.session_id);
      types.add(e.event_type);
    }
    return {
      source_apps: [...apps].sort(),
      session_ids: [...sessions].sort(),
      event_types: [...types].sort(),
    };
  });

  const buckets = computed(() => {
    const now = Date.now();
    const counts = new Array(60).fill(0);
    for (const e of state.events.values()) {
      const age = Math.floor((now - new Date(e.created_at).getTime()) / 1000);
      if (age >= 0 && age < 60) {
        counts[59 - age]++;
      }
    }
    return counts;
  });

  const eventCount = computed(() => state.events.size);

  function addEvent(event: StoredEvent) {
    if (state.events.has(event.event_id)) return;
    state.events.set(event.event_id, event);
    pruneIfNeeded();
  }

  function addEvents(events: StoredEvent[]) {
    for (const event of events) {
      if (!state.events.has(event.event_id)) {
        state.events.set(event.event_id, event);
      }
    }
    pruneIfNeeded();
  }

  function setFilter(key: keyof Filters, value: string | null) {
    state.filters[key] = value;
  }

  function clearFilters() {
    state.filters.source_app = null;
    state.filters.session_id = null;
    state.filters.event_type = null;
  }

  function setConnected(value: boolean) {
    state.connected = value;
  }

  function getEventById(eventId: string): StoredEvent | undefined {
    return state.events.get(eventId);
  }

  function getContextFromStore(
    runId: string,
    agentId: string | null,
    centerTs: string,
    windowSec: number = 300
  ): StoredEvent[] {
    const center = new Date(centerTs).getTime();
    const start = center - windowSec * 1000;
    const end = center + windowSec * 1000;
    const result: StoredEvent[] = [];
    for (const e of state.events.values()) {
      if (e.run_id !== runId) continue;
      if (agentId && e.agent_id !== agentId) continue;
      const t = new Date(e.created_at).getTime();
      if (t >= start && t <= end) result.push(e);
    }
    return result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }

  return {
    state,
    sortedEvents,
    filteredEvents,
    filterOptions,
    buckets,
    eventCount,
    addEvent,
    addEvents,
    setFilter,
    clearFilters,
    setConnected,
    getEventById,
    getContextFromStore,
  };
}
