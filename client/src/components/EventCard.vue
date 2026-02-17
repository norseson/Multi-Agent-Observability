<script setup lang="ts">
import { ref } from "vue";
import type { StoredEvent } from "../stores/events";
import { truncateHash, formatTimestamp, eventColor, eventBadgeClasses, formatDuration } from "../utils/format";

const props = defineProps<{
  event: StoredEvent;
}>();

const emit = defineEmits<{
  (e: 'show-trace', eventId: string): void;
}>();

const expanded = ref(false);

function exitCodeClass(code: number): string {
  return code === 0
    ? 'bg-green-500/15 text-green-400 border-green-500/20'
    : 'bg-red-500/15 text-red-400 border-red-500/20';
}

function riskLevelClass(level: 'low' | 'med' | 'high'): string {
  if (level === 'low') return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20';
  if (level === 'med') return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
  return 'bg-red-500/15 text-red-400 border-red-500/20';
}

function isRunSummary(event: StoredEvent): boolean {
  return event.event_type === 'run.summary';
}

function handleTraceClick(e: Event) {
  e.stopPropagation();
  emit('show-trace', props.event.event_id);
}
</script>

<template>
  <div
    class="relative bg-noir-900 border border-noir-700 rounded-lg overflow-hidden hover:border-noir-700/80 transition-colors cursor-pointer"
    @click="expanded = !expanded"
  >
    <!-- Left color bar -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1 rounded-l"
      :style="{ backgroundColor: eventColor(event.event_type) }"
    />

    <div class="pl-4 pr-4 py-3">
      <!-- Run Summary Header (special case) -->
      <div v-if="isRunSummary(event)" class="mb-2 pb-2 border-b border-blue-500/30">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-blue-400 text-sm">📊</span>
          <span class="text-sm font-medium text-blue-400">Run Summary</span>
        </div>
        <div class="flex items-center gap-3 flex-wrap text-xs">
          <span v-if="event.payload.total_events" class="text-gray-400">{{ event.payload.total_events }} events</span>
          <span v-if="event.payload.tools_used" class="text-gray-400">{{ (event.payload.tools_used as string[]).length }} tools</span>
          <span v-if="event.payload.tool_errors" class="text-red-400">{{ event.payload.tool_errors }} errors</span>
          <span v-if="event.payload.total_duration_ms" class="text-purple-400">{{ formatDuration(event.payload.total_duration_ms as number) }}</span>
        </div>
      </div>

      <!-- Top row: badges + timestamp -->
      <div class="flex items-center justify-between mb-1.5">
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Source app badge -->
          <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
            {{ event.source_app }}
          </span>
          <!-- Session hash -->
          <span class="text-xs text-gray-500 font-mono">
            {{ truncateHash(event.session_id) }}
          </span>
          <!-- Event type badge -->
          <span
            class="px-2 py-0.5 rounded-full text-xs font-medium"
            :class="eventBadgeClasses(event.event_type)"
          >
            {{ event.event_type }}
          </span>
          <!-- Duration badge -->
          <span
            v-if="event.duration_ms !== null"
            class="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/20"
          >
            {{ formatDuration(event.duration_ms) }}
          </span>
          <!-- Exit code badge -->
          <span
            v-if="event.exit_code !== null"
            class="px-2 py-0.5 rounded-full text-xs font-medium border"
            :class="exitCodeClass(event.exit_code)"
          >
            exit: {{ event.exit_code }}
          </span>
          <!-- Risk level badge -->
          <span
            v-if="event.risk_level"
            class="px-2 py-0.5 rounded-full text-xs font-medium border"
            :class="riskLevelClass(event.risk_level)"
          >
            {{ event.risk_level }}
          </span>
          <!-- Task ID badge -->
          <span
            v-if="event.task_id"
            class="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
          >
            task:{{ truncateHash(event.task_id) }}
          </span>
          <!-- View Trace button -->
          <button
            v-if="event.run_id"
            @click="handleTraceClick"
            class="px-2 py-0.5 rounded text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-colors"
          >
            View Trace
          </button>
        </div>
        <span class="text-xs text-gray-500 tabular-nums">
          {{ formatTimestamp(event.created_at) }}
        </span>
      </div>

      <!-- Summary -->
      <div class="flex items-center gap-2">
        <span v-if="event.tool_name" class="text-xs text-gray-500">{{ event.tool_name }}</span>
        <p class="text-sm text-gray-300">{{ event.summary }}</p>
      </div>

      <!-- Expanded payload -->
      <div v-if="expanded" class="mt-3 pt-3 border-t border-noir-700">
        <pre class="text-xs text-gray-500 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{{ JSON.stringify(event.payload, null, 2) }}</pre>
      </div>
    </div>
  </div>
</template>
