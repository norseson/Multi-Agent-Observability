<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { StoredEvent } from "../stores/events";
import EventCard from "./EventCard.vue";

const props = defineProps<{
  events: StoredEvent[];
}>();

const emit = defineEmits<{
  (e: 'show-trace', eventId: string): void;
}>();

const container = ref<HTMLElement | null>(null);
const autoScroll = ref(true);

function onScroll() {
  if (!container.value) return;
  // Auto-scroll when user is near the top (newest events are at top)
  autoScroll.value = container.value.scrollTop < 80;
}

watch(
  () => props.events.length,
  async () => {
    if (autoScroll.value) {
      await nextTick();
      if (container.value) {
        container.value.scrollTop = 0;
      }
    }
  }
);
</script>

<template>
  <div
    ref="container"
    class="overflow-y-auto space-y-2"
    style="max-height: calc(100vh - 340px)"
    @scroll="onScroll"
  >
    <TransitionGroup name="event-fade">
      <EventCard
        v-for="event in events"
        :key="event.event_id"
        :event="event"
        @show-trace="(eventId) => emit('show-trace', eventId)"
      />
    </TransitionGroup>

    <div v-if="events.length === 0" class="text-center py-16 text-gray-600">
      <p class="text-lg">Waiting for events...</p>
      <p class="text-sm mt-1">Send hook events to POST /api/events</p>
    </div>
  </div>
</template>

<style scoped>
.event-fade-enter-active {
  transition: all 0.3s ease;
}
.event-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
