<template>
  <table class="w-full text-white text-center font-bold">
    <thead>
      <tr class="border-b-2 border-yellow-400">
        <th class="px-0.5 py-1 text-left text-sm w-10">隊伍</th>
        <th v-for="i in 9" :key="i" class="px-0.5 py-1 w-8 text-base" :class="{ 'bg-yellow-500/30': i === inning }">
          {{ i }}
        </th>
        <th class="px-0.5 py-1 bg-yellow-500 text-green-900 font-black w-8 text-base">R</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="gameType !== 'single'" class="border-b border-yellow-400/50">
        <td class="px-0.5 py-1 text-left font-black text-sm">客隊</td>
        <td v-for="i in 9" :key="i" class="px-0.5 py-1 text-xl" :class="{ 'bg-yellow-500/30': i === inning && isTop }">
          {{ inningScores.away[i-1] !== undefined ? inningScores.away[i-1] : '-' }}
        </td>
        <td class="px-0.5 py-1 bg-yellow-500 text-green-900 font-black text-2xl">{{ score.away }}</td>
      </tr>
      <tr v-if="gameType !== 'single'">
        <td class="px-0.5 py-1 text-left font-black text-sm">主隊</td>
        <td v-for="i in 9" :key="i" class="px-0.5 py-1 text-xl" :class="{ 'bg-yellow-500/30': i === inning && !isTop }">
          {{ inningScores.home[i-1] !== undefined ? inningScores.home[i-1] : '-' }}
        </td>
        <td class="px-0.5 py-1 bg-yellow-500 text-green-900 font-black text-2xl">{{ score.home }}</td>
      </tr>
      <tr v-if="gameType === 'single'">
        <td class="px-0.5 py-1 text-left font-black text-sm">得分</td>
        <td v-for="i in 9" :key="i" class="px-0.5 py-1 text-xl" :class="{ 'bg-yellow-500/30': i === inning }">
          {{ inningScores.away[i-1] !== undefined ? inningScores.away[i-1] : '-' }}
        </td>
        <td class="px-0.5 py-1 bg-yellow-500 text-green-900 font-black text-2xl">{{ score.away }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup>
defineProps({
  gameType: {
    type: String,
    required: true
  },
  inning: {
    type: Number,
    required: true
  },
  isTop: {
    type: Boolean,
    required: true
  },
  score: {
    type: Object,
    required: true
  },
  inningScores: {
    type: Object,
    required: true
  },
  awayTeam: {
    type: String,
    default: ''
  },
  homeTeam: {
    type: String,
    default: ''
  }
});
</script>
