<template>
  <div class="flex gap-2 mb-2">
    <button v-for="org in ORGS" :key="org.id"
      @click="$emit('update:modelValue', org.id)"
      :class="[
        'px-4 py-1.5 rounded-full font-bold text-sm transition-all duration-150 border cursor-pointer min-h-11',
        modelValue === org.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
      ]">
      {{ org.label }}
    </button>
  </div>
</template>

<script setup>
import { ORGS } from '../constants/teams.js'

defineProps({ modelValue: String })
defineEmits(['update:modelValue'])
</script>
