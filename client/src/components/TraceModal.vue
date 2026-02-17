<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useEventStore, type StoredEvent } from '../stores/events';
import { truncateHash, formatTimestamp, formatDuration } from '../utils/format';

const props = defineProps<{
  eventId: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = useEventStore();

const focusedEventId = ref(props.eventId);
const ancestors = ref<StoredEvent[]>([]);
const focusedEvent = ref<StoredEvent | null>(null);
const contextEvents = ref<StoredEvent[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const copied = ref(false);

async function loadTrace(eventId: string) {
  loading.value = true;
  error.value = null;
  focusedEventId.value = eventId;

  try {
    // Step 1: Get focused event (store-first)
    let event = store.getEventById(eventId);
    if (!event) {
      const resp = await fetch(`/api/trace/${eventId}`);
      if (!resp.ok) throw new Error('Failed to load trace');
      const data = await resp.json();
      event = data.root;
      ancestors.value = data.ancestors || [];
    } else {
      // Walk parent chain from store, fallback to API
      ancestors.value = await resolveAncestors(eventId);
    }
    focusedEvent.value = event!;

    // Step 2: Get context window (store-first, API-fallback)
    if (event!.run_id) {
      let ctx = store.getContextFromStore(
        event!.run_id,
        event!.agent_id,
        event!.created_at,
        300
      );
      if (ctx.length < 3) {
        // Too few events in store, fetch from API
        const params = new URLSearchParams({
          run_id: event!.run_id,
          ts: event!.created_at,
          window_sec: '300',
        });
        if (event!.agent_id) params.set('agent_id', event!.agent_id);
        const resp = await fetch(`/api/events/context?${params}`);
        if (resp.ok) {
          const data = await resp.json();
          ctx = data.events;
        }
      }
      // Exclude ancestors and the focused event from context to avoid duplication
      const ancestorIds = new Set(ancestors.value.map(a => a.event_id));
      ancestorIds.add(eventId);
      contextEvents.value = ctx.filter(e => !ancestorIds.has(e.event_id));
    } else {
      contextEvents.value = [];
    }
  } catch (err: any) {
    error.value = err.message || 'Unknown error';
  } finally {
    loading.value = false;
  }
}

async function resolveAncestors(eventId: string): Promise<StoredEvent[]> {
  const chain: StoredEvent[] = [];
  let currentId: string | null = eventId;
  const visited = new Set<string>();
  let depth = 0;

  // Get the starting event to find its parent
  let current = store.getEventById(currentId);
  if (!current) return chain;
  currentId = current.parent_event_id;

  while (currentId && !visited.has(currentId) && depth < 25) {
    visited.add(currentId);
    const parent = store.getEventById(currentId);
    if (parent) {
      chain.unshift(parent);
      currentId = parent.parent_event_id;
      depth++;
    } else {
      // Parent not in store -- fall back to API for remaining chain
      const resp = await fetch(`/api/trace/${eventId}`);
      if (resp.ok) {
        const data = await resp.json();
        return data.ancestors || [];
      }
      break;
    }
  }
  return chain;
}

function refocus(eventId: string) {
  loadTrace(eventId);
  // Update hash for deep linking
  window.location.hash = `trace=${eventId}`;
}

async function copyTraceLink() {
  const url = `${window.location.origin}${window.location.pathname}#trace=${focusedEventId.value}`;
  try {
    await navigator.clipboard.writeText(url);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // Fallback: select-and-copy via input trick
    const el = document.createElement('input');
    el.value = url;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  }
}

function closeModal() {
  emit('close');
}

onMounted(() => {
  loadTrace(props.eventId);
});
</script>

<template>
  <div
    class="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
    @click.self="closeModal"
  >
    <div class="bg-noir-900 border border-noir-700 rounded-lg max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-noir-700">
        <h2 class="text-lg font-medium text-gray-200">Event Trace</h2>
        <button
          @click="closeModal"
          class="text-gray-400 hover:text-gray-200 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto px-6 py-4">
        <!-- Loading state -->
        <div v-if="loading" class="text-center text-gray-500 py-8">
          Loading trace...
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="text-center text-red-400 py-8">
          {{ error }}
        </div>

        <!-- Trace content -->
        <div v-else-if="focusedEvent" class="space-y-6">
          <!-- Ancestors (Parent Chain) -->
          <div v-if="ancestors.length > 0" class="space-y-2">
            <h3 class="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Parent Chain ({{ ancestors.length }})
            </h3>
            <div
              v-for="(ancestor, index) in ancestors"
              :key="ancestor.event_id"
              class="border-l-2 border-cyan-500/50 pl-3 py-1.5 bg-noir-800/50 rounded cursor-pointer hover:bg-noir-800 transition-colors"
              :style="{ marginLeft: `${Math.min(index * 12, 120)}px` }"
              @click="refocus(ancestor.event_id)"
            >
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs text-cyan-400 font-mono">{{ truncateHash(ancestor.event_id) }}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300">{{ ancestor.event_type }}</span>
                <span v-if="ancestor.tool_name" class="px-1.5 py-0.5 rounded text-[10px] bg-blue-900/50 text-blue-300">{{ ancestor.tool_name }}</span>
                <span v-if="ancestor.duration_ms !== null" class="text-[10px] text-purple-400">{{ formatDuration(ancestor.duration_ms) }}</span>
                <span v-if="ancestor.exit_code !== null" class="text-[10px]" :class="ancestor.exit_code === 0 ? 'text-green-400' : 'text-red-400'">exit:{{ ancestor.exit_code }}</span>
                <span v-if="ancestor.risk_level" class="text-[10px]" :class="{ 'text-yellow-400': ancestor.risk_level === 'low', 'text-orange-400': ancestor.risk_level === 'med', 'text-red-400': ancestor.risk_level === 'high' }">{{ ancestor.risk_level }}</span>
                <span v-if="ancestor.task_id" class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-900/50 text-indigo-300">task:{{ truncateHash(ancestor.task_id) }}</span>
              </div>
              <p class="text-xs text-gray-400 mt-0.5 truncate">{{ ancestor.summary }}</p>
            </div>
          </div>

          <!-- Focused Event (highlighted) -->
          <div class="space-y-2">
            <h3 class="text-sm font-medium text-gray-400 uppercase tracking-wider">Focused Event</h3>
            <div class="border-l-2 border-cyan-400 bg-cyan-500/10 pl-4 py-3 rounded">
              <div class="flex items-center gap-1.5 flex-wrap mb-1">
                <span class="text-xs text-cyan-300 font-mono font-semibold">{{ truncateHash(focusedEvent.event_id) }}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] bg-cyan-700 text-cyan-200">{{ focusedEvent.event_type }}</span>
                <span v-if="focusedEvent.tool_name" class="px-1.5 py-0.5 rounded text-[10px] bg-blue-800/50 text-blue-200">{{ focusedEvent.tool_name }}</span>
                <span v-if="focusedEvent.duration_ms !== null" class="text-[10px] text-purple-300">{{ formatDuration(focusedEvent.duration_ms) }}</span>
                <span v-if="focusedEvent.exit_code !== null" class="text-[10px]" :class="focusedEvent.exit_code === 0 ? 'text-green-300' : 'text-red-300'">exit:{{ focusedEvent.exit_code }}</span>
                <span v-if="focusedEvent.risk_level" class="text-[10px]" :class="{ 'text-yellow-300': focusedEvent.risk_level === 'low', 'text-orange-300': focusedEvent.risk_level === 'med', 'text-red-300': focusedEvent.risk_level === 'high' }">{{ focusedEvent.risk_level }}</span>
                <span v-if="focusedEvent.task_id" class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-800/50 text-indigo-200">task:{{ truncateHash(focusedEvent.task_id) }}</span>
              </div>
              <p class="text-sm text-gray-200 mt-1">{{ focusedEvent.summary }}</p>
              <span class="text-xs text-gray-400 mt-1 block">{{ formatTimestamp(focusedEvent.created_at) }}</span>
            </div>
          </div>

          <!-- Context Window -->
          <div v-if="contextEvents.length > 0" class="space-y-2">
            <h3 class="text-sm font-medium text-gray-400 uppercase tracking-wider">
              Context Window ({{ contextEvents.length }} events, ±5min)
            </h3>
            <div class="space-y-1 max-h-64 overflow-y-auto">
              <div
                v-for="ctx in contextEvents"
                :key="ctx.event_id"
                class="pl-3 py-1 bg-noir-800/30 rounded cursor-pointer hover:bg-noir-800/60 flex items-center gap-1.5 flex-wrap transition-colors"
                @click="refocus(ctx.event_id)"
              >
                <span class="text-[10px] text-gray-500 font-mono">{{ truncateHash(ctx.event_id) }}</span>
                <span class="px-1.5 py-0.5 rounded text-[10px] bg-gray-700 text-gray-300">{{ ctx.event_type }}</span>
                <span v-if="ctx.tool_name" class="text-[10px] text-blue-300">{{ ctx.tool_name }}</span>
                <span v-if="ctx.duration_ms !== null" class="text-[10px] text-purple-400">{{ formatDuration(ctx.duration_ms) }}</span>
                <span v-if="ctx.exit_code !== null" class="text-[10px]" :class="ctx.exit_code === 0 ? 'text-green-400' : 'text-red-400'">exit:{{ ctx.exit_code }}</span>
                <span v-if="ctx.task_id" class="text-[10px] text-indigo-300">task:{{ truncateHash(ctx.task_id) }}</span>
                <span class="text-[10px] text-gray-500 truncate flex-1">{{ ctx.summary }}</span>
                <span class="text-[10px] text-gray-600 ml-auto">{{ formatTimestamp(ctx.created_at) }}</span>
              </div>
            </div>
          </div>

          <!-- No trace data -->
          <div v-if="ancestors.length === 0 && contextEvents.length === 0" class="text-center text-gray-500 py-4">
            No parent or context events found for this event.
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-noir-700 flex justify-between">
        <button
          @click="copyTraceLink"
          class="px-4 py-2 bg-noir-800 text-gray-300 border border-noir-700 rounded hover:bg-noir-700 transition-colors text-sm flex items-center gap-2"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
          {{ copied ? 'Copied!' : 'Copy Trace Link' }}
        </button>
        <button
          @click="closeModal"
          class="px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded hover:bg-cyan-500/20 transition-colors text-sm"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bg-noir-900 {
  background-color: #0a0a0f;
}

.bg-noir-800 {
  background-color: #121218;
}

.border-noir-700 {
  border-color: #1e1e26;
}
</style>
