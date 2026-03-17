<template>
  <div v-if="notification" :class="[
    'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 px-6 py-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 transition-all',
    notification.type === 'alert' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'
  ]">
    <XCircleIcon v-if="notification.type === 'alert'" />
    <InfoIcon v-else />
    <span class="text-lg font-bold">{{ notification.text }}</span>
  </div>
</template>

<script setup>
import { XCircleIcon, InfoIcon } from './Icons.vue'

defineProps({
  notification: {
    type: Object,
    default: null
  }
})
</script>
