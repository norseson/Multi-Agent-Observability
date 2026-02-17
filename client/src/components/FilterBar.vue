<script setup lang="ts">
defineProps<{
  options: {
    source_apps: string[];
    session_ids: string[];
    event_types: string[];
  };
  filters: {
    source_app: string | null;
    session_id: string | null;
    event_type: string | null;
  };
}>();

const emit = defineEmits<{
  (e: "update:filter", key: "source_app" | "session_id" | "event_type", value: string | null): void;
}>();

function onSelect(key: "source_app" | "session_id" | "event_type", event: Event) {
  const val = (event.target as HTMLSelectElement).value;
  emit("update:filter", key, val || null);
}
</script>

<template>
  <div class="grid grid-cols-3 gap-4">
    <!-- Source App -->
    <div>
      <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1">Source App</label>
      <select
        class="w-full bg-noir-900 border border-noir-700 rounded-md px-3 py-2 text-sm text-gray-300 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
        :value="filters.source_app || ''"
        @change="onSelect('source_app', $event)"
      >
        <option value="">All Sources</option>
        <option v-for="app in options.source_apps" :key="app" :value="app">{{ app }}</option>
      </select>
    </div>

    <!-- Session ID -->
    <div>
      <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1">Session ID</label>
      <select
        class="w-full bg-noir-900 border border-noir-700 rounded-md px-3 py-2 text-sm text-gray-300 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
        :value="filters.session_id || ''"
        @change="onSelect('session_id', $event)"
      >
        <option value="">All Sessions</option>
        <option v-for="sid in options.session_ids" :key="sid" :value="sid">{{ sid }}</option>
      </select>
    </div>

    <!-- Event Type -->
    <div>
      <label class="block text-xs text-gray-500 uppercase tracking-wider mb-1">Event Type</label>
      <select
        class="w-full bg-noir-900 border border-noir-700 rounded-md px-3 py-2 text-sm text-gray-300 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
        :value="filters.event_type || ''"
        @change="onSelect('event_type', $event)"
      >
        <option value="">All Types</option>
        <option v-for="t in options.event_types" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>
  </div>
</template>
