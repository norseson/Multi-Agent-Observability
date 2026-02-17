<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useEventStore } from "./stores/events";
import { useWebSocket } from "./composables/useWebSocket";
import LivePulse from "./components/LivePulse.vue";
import FilterBar from "./components/FilterBar.vue";
import EventStream from "./components/EventStream.vue";
import TraceModal from "./components/TraceModal.vue";

const store = useEventStore();
useWebSocket();

const showTrace = ref(false);
const selectedEventId = ref("");

function parseTraceHash(): string | null {
  const match = window.location.hash.match(/^#trace=(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function onHashChange() {
  const id = parseTraceHash();
  if (id) handleShowTrace(id);
}

function handleShowTrace(eventId: string) {
  selectedEventId.value = eventId;
  showTrace.value = true;
  window.location.hash = `trace=${eventId}`;
}

function handleCloseTrace() {
  showTrace.value = false;
  selectedEventId.value = "";
  if (window.location.hash.startsWith("#trace=")) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

onMounted(() => {
  const id = parseTraceHash();
  if (id) handleShowTrace(id);
  window.addEventListener("hashchange", onHashChange);
});

onUnmounted(() => {
  window.removeEventListener("hashchange", onHashChange);
});
</script>

<template>
  <div class="min-h-screen bg-noir-950 text-gray-200 font-mono">
    <!-- Header -->
    <header class="border-b border-noir-700 px-6 py-4 flex items-center justify-between">
      <h1 class="text-xl font-semibold tracking-wide text-gray-100">
        Multi-Agent Observability
      </h1>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2 text-sm">
          <span
            class="w-2.5 h-2.5 rounded-full glow-dot"
            :class="store.state.connected ? 'bg-green-400 text-green-400' : 'bg-red-500 text-red-500'"
          />
          <span :class="store.state.connected ? 'text-green-400' : 'text-red-400'">
            {{ store.state.connected ? "Connected" : "Disconnected" }}
          </span>
        </div>
        <span class="text-gray-500 text-sm">{{ store.eventCount.value }} events</span>
      </div>
    </header>

    <!-- Main Content -->
    <main class="px-6 py-4 space-y-4">
      <!-- Live Activity Pulse -->
      <section>
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm text-gray-500 uppercase tracking-wider">Live Activity Pulse</h2>
          <div class="flex gap-1 text-xs">
            <span class="px-2 py-0.5 rounded bg-noir-800 text-gray-400">1m</span>
          </div>
        </div>
        <LivePulse :buckets="store.buckets.value" />
      </section>

      <!-- Filters -->
      <FilterBar
        :options="store.filterOptions.value"
        :filters="store.state.filters"
        @update:filter="(key, val) => store.setFilter(key, val)"
      />

      <!-- Event Stream -->
      <section>
        <h2 class="text-lg font-medium text-gray-200 mb-3">Agent Event Stream</h2>
        <EventStream :events="store.filteredEvents.value" @show-trace="handleShowTrace" />
      </section>
    </main>

    <!-- Trace Modal -->
    <TraceModal
      v-if="showTrace"
      :event-id="selectedEventId"
      @close="handleCloseTrace"
    />
  </div>
</template>
