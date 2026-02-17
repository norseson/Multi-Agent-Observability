<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  buckets: number[];
}>();

const maxCount = computed(() => Math.max(1, ...props.buckets));

const BAR_WIDTH = 9;
const GAP = 1;
const HEIGHT = 48;
const VIEW_WIDTH = props.buckets.length * (BAR_WIDTH + GAP);
</script>

<template>
  <div class="w-full rounded-lg bg-noir-900 border border-noir-700 p-3 overflow-hidden">
    <svg
      :viewBox="`0 0 ${VIEW_WIDTH} ${HEIGHT}`"
      class="w-full"
      :style="{ height: HEIGHT + 'px' }"
      preserveAspectRatio="none"
    >
      <rect
        v-for="(count, i) in buckets"
        :key="i"
        :x="i * (BAR_WIDTH + GAP)"
        :y="HEIGHT - (count / maxCount) * HEIGHT"
        :width="BAR_WIDTH"
        :height="Math.max(count > 0 ? 2 : 0, (count / maxCount) * HEIGHT)"
        rx="1"
        :fill="count > 0 ? '#22d3ee' : '#1e293b'"
        :opacity="count > 0 ? 0.3 + 0.7 * (count / maxCount) : 0.2"
        :class="{ 'animate-pulse-glow': i === buckets.length - 1 && count > 0 }"
      />
      <!-- Baseline -->
      <line
        x1="0"
        :y1="HEIGHT - 1"
        :x2="VIEW_WIDTH"
        :y2="HEIGHT - 1"
        stroke="#374151"
        stroke-width="0.5"
      />
    </svg>
    <!-- Time labels -->
    <div class="flex justify-between mt-1 text-[10px] text-gray-600">
      <span>60s</span>
      <span>30s</span>
      <span>now</span>
    </div>
  </div>
</template>
