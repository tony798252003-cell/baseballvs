<template>
  <div class="w-full h-full bg-gradient-to-br from-slate-50 via-white to-sky-50 flex">
    <!-- 左側：球隊選擇與球員列表 -->
    <div class="w-2/3 h-full flex flex-col p-6 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-4xl font-black text-slate-900">
            <template v-if="isSelectingPitcher">
              {{ gameType !== 'single' ? (isSelectingAwayTeam ? '客隊投手' : '主隊投手') : '選擇投手' }}
            </template>
            <template v-else>
              {{ gameType === 'single' ? '選擇打者' : (isSelectingAwayTeam ? '客隊打序' : '主隊打序') }}
            </template>
          </h2>
          <p v-if="gameType !== 'single'" class="text-sm text-slate-500 font-bold mt-1">
            <template v-if="isSelectingPitcher">
              從左側選擇本局先發投手
            </template>
            <template v-else>
              {{ isSelectingAwayTeam ? '先選擇客隊（上半局進攻）9位打者及投手' : '選擇主隊（下半局進攻）9位打者及投手' }}
            </template>
          </p>
        </div>
        <button @click="$emit('back')" class="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg transition-all duration-150 cursor-pointer min-h-11">
          ← 返回
        </button>
      </div>

      <!-- 一軍/二軍切換 -->
      <div class="flex gap-2 mb-2">
        <button v-for="l in ['一軍', '二軍', 'coach', 'all']" :key="l"
          @click="$emit('update:selected-league', l)"
          :class="[
            'px-4 py-1.5 rounded-full font-bold text-sm transition-all duration-150 border cursor-pointer min-h-11',
            selectedLeague === l ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
          ]">
          {{ l === 'all' ? '全部' : l === 'coach' ? '教練' : l }}
        </button>
      </div>

      <!-- 進階模式：守位篩選 -->
      <div v-if="gameType === 'advanced'" class="flex gap-1 mb-2 flex-wrap">
        <button @click="advancedPositionFilter = null"
          :class="['px-2 py-1 rounded-lg font-bold text-xs border transition cursor-pointer', advancedPositionFilter === null ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-400']">
          全部
        </button>
        <button v-for="pos in ADVANCED_POSITIONS" :key="pos"
          @click="advancedPositionFilter = pos"
          :class="['px-2 py-1 rounded-lg font-bold text-xs border transition cursor-pointer', advancedPositionFilter === pos ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:border-emerald-400']">
          {{ pos }}
        </button>
      </div>

      <!-- 球隊篩選（打者模式） -->
      <template v-if="!isSelectingPitcher">
        <div class="flex gap-2 mb-4 flex-wrap">
          <button @click="$emit('update:selectedTeam', null)" :class="[
            'px-4 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md cursor-pointer min-h-11',
            selectedTeam === null ? 'bg-indigo-600 text-white border-indigo-600 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
          ]">
            全部 ({{ batters.length }})
          </button>
          <!-- 中職六隊 -->
          <button v-for="team in cpblTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
            'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
            selectedTeam === team ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
          ]">
            <img v-if="teamLogos[team]" :src="teamLogos[team]" class="w-16 h-16 object-contain" :alt="team" />
            <span class="text-2xl" v-else>⚾</span>
            <div class="text-center">
              <div class="text-xs font-bold">{{ team }}</div>
              <div class="text-xs opacity-75">({{ getBatterCount(team) }})</div>
            </div>
          </button>
          <!-- 其他球隊折疊按鈕 -->
          <button v-if="otherTeamsWithBatters.length > 0"
            @click="showOtherTeams = !showOtherTeams"
            :class="[
              'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
              isOtherBatterTeamSelected ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
            ]">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
            </svg>
            <div class="text-center">
              <div class="text-xs font-bold">其他球隊</div>
              <div class="text-xs opacity-75">{{ showOtherTeams ? '▲ 收折' : '▼ 展開' }}</div>
            </div>
          </button>
          <!-- 展開後的其他球隊 -->
          <template v-if="showOtherTeams">
            <button v-for="team in otherTeamsWithBatters" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
              'px-3 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-0.5 cursor-pointer',
              selectedTeam === team ? 'ring-2 ring-indigo-500 bg-indigo-50 border-indigo-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300'
            ]">
              <span class="text-lg">⚾</span>
              <div class="text-center">
                <div class="text-xs font-bold leading-tight" style="max-width:72px; word-break:break-all">{{ team }}</div>
                <div class="text-xs opacity-75">({{ getBatterCount(team) }})</div>
              </div>
            </button>
          </template>
        </div>

        <!-- 打者列表 -->
        <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 content-start">
          <button v-for="player in advancedFilteredBatters" :key="player.name + player.number"
            @click="$emit('add-player', player)"
            :disabled="currentLineup.some(p => p.name === player.name && p.number === player.number)"
            class="bg-white hover:shadow-md disabled:bg-slate-50 disabled:opacity-40 p-2 rounded-lg transition-all duration-150 transform hover:scale-105 text-left border border-slate-100 hover:border-indigo-300 disabled:border-slate-100 shadow-sm cursor-pointer disabled:cursor-not-allowed">
            <div class="flex items-start gap-2">
              <img v-if="player.photo" :src="player.photo" class="w-12 h-12 rounded-full object-cover border-2 border-indigo-300 shadow-md flex-shrink-0" />
              <div v-else class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">⚾</div>
              <div class="flex-1 min-w-0 flex flex-col justify-between">
                <div class="flex items-center gap-1 mb-1">
                  <span :class="[
                    'text-slate-900 font-black leading-tight',
                    player.name.length > 6 ? 'text-sm' : player.name.length > 4 ? 'text-base' : 'text-lg'
                  ]" :style="player.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ player.name }}</span>
                  <span v-if="player.song" class="text-xs text-indigo-500">♪</span>
                </div>
                <div class="text-xs text-slate-500 font-bold">#{{ player.number }} · {{ player.mainPosition }}</div>
              </div>
            </div>
          </button>
        </div>
      </template>

      <!-- 球隊篩選（投手模式） -->
      <template v-else>
        <div class="flex gap-2 mb-4 flex-wrap">
          <button @click="$emit('update:selectedTeam', null)" :class="[
            'px-4 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md cursor-pointer min-h-11',
            selectedTeam === null ? 'bg-amber-500 text-white border-amber-500 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
          ]">
            全部 ({{ pitchers.length }})
          </button>
          <!-- 中職六隊投手 -->
          <button v-for="team in cpblTeamsWithPitchers" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
            'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
            selectedTeam === team ? 'ring-2 ring-amber-500 bg-amber-50 border-amber-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
          ]">
            <img v-if="teamLogos[team]" :src="teamLogos[team]" class="w-16 h-16 object-contain" :alt="team" />
            <span class="text-2xl" v-else>⚾</span>
            <div class="text-center">
              <div class="text-xs font-bold">{{ team }}</div>
              <div class="text-xs opacity-75">({{ getPitcherCount(team) }})</div>
            </div>
          </button>
          <!-- 其他球隊折疊 -->
          <button v-if="otherTeamsWithPitchers.length > 0"
            @click="showOtherPitcherTeams = !showOtherPitcherTeams"
            :class="[
              'px-3 py-3 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-1 cursor-pointer',
              isOtherPitcherTeamSelected ? 'ring-2 ring-amber-500 bg-amber-50 border-amber-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
            ]">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"/>
            </svg>
            <div class="text-center">
              <div class="text-xs font-bold">其他球隊</div>
              <div class="text-xs opacity-75">{{ showOtherPitcherTeams ? '▲ 收折' : '▼ 展開' }}</div>
            </div>
          </button>
          <template v-if="showOtherPitcherTeams">
            <button v-for="team in otherTeamsWithPitchers" :key="team" @click="$emit('update:selectedTeam', team)" :class="[
              'px-3 py-2 rounded-2xl font-bold transition-all duration-150 border shadow-md flex flex-col items-center gap-0.5 cursor-pointer',
              selectedTeam === team ? 'ring-2 ring-amber-500 bg-amber-50 border-amber-300 scale-105' : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50 hover:border-amber-300'
            ]">
              <span class="text-lg">⚾</span>
              <div class="text-center">
                <div class="text-xs font-bold leading-tight" style="max-width:72px; word-break:break-all">{{ team }}</div>
                <div class="text-xs opacity-75">({{ getPitcherCount(team) }})</div>
              </div>
            </button>
          </template>
        </div>

        <!-- 投手列表 -->
        <div class="flex-1 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 content-start">
          <button v-for="player in filteredPitchers" :key="player.name + player.number"
            @click="selectPitcher(player)"
            class="bg-white hover:shadow-md p-2 rounded-lg transition-all duration-150 transform hover:scale-105 text-left border border-slate-100 hover:border-amber-300 shadow-sm cursor-pointer">
            <div class="flex items-start gap-2">
              <img v-if="player.photo" :src="player.photo" class="w-12 h-12 rounded-full object-cover border-2 border-amber-300 shadow-md flex-shrink-0" />
              <div v-else class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">⚾</div>
              <div class="flex-1 min-w-0 flex flex-col justify-between">
                <div class="flex items-center gap-1 mb-1">
                  <span :class="[
                    'text-slate-900 font-black leading-tight',
                    player.name.length > 6 ? 'text-sm' : player.name.length > 4 ? 'text-base' : 'text-lg'
                  ]" :style="player.name.length > 6 ? 'word-wrap: break-word; overflow-wrap: break-word;' : ''">{{ player.name }}</span>
                  <span v-if="player.song" class="text-xs text-amber-500">♪</span>
                </div>
                <div class="text-xs text-slate-500 font-bold">#{{ player.number }} · {{ player.mainPosition }}</div>
              </div>
            </div>
          </button>
        </div>
      </template>
    </div>

    <!-- 右側：已選打序 -->
    <div class="w-1/3 h-full bg-slate-50 border-l border-slate-100 shadow-inner p-4 flex flex-col overflow-hidden relative">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xl font-black text-slate-900">
          {{ gameType === 'single' ? '打者' : (isSelectingAwayTeam ? '客隊' : '主隊') }} ({{ currentLineup.length }}/9)
        </h3>
        <!-- 進階模式：換位模式切換 -->
        <button v-if="gameType === 'advanced' && currentLineup.length >= 2"
          @click="toggleSwapMode"
          :class="['px-2 py-1 rounded-lg font-bold text-xs border transition cursor-pointer',
            swapMode ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-600 border-slate-300 hover:bg-orange-50 hover:border-orange-400']">
          {{ swapMode ? (swapFirstIndex >= 0 ? '選第2位' : '取消換位') : '⇄ 換位' }}
        </button>
      </div>

      <!-- 9個棒次固定顯示，不捲動 - 為投手區域預留空間 -->
      <div class="flex flex-col justify-between" style="height: calc(100% - 280px); min-height: 300px; overflow-y: auto;">
        <!-- 已選擇的打者 -->
        <div v-for="(player, index) in currentLineup" :key="index"
          @click="onLineupSlotClick(index)"
          :class="[
            'bg-white p-1.5 rounded-lg flex items-center gap-2 shadow-sm cursor-pointer hover:shadow-md transition-all duration-150',
            swapMode && swapFirstIndex === index ? 'border-2 border-orange-400 bg-orange-50' :
            swapMode ? 'border border-orange-200 hover:border-orange-400' :
            replacingIndex === index ? 'border-2 border-amber-400 animate-pulse' : 'border border-slate-200 hover:border-indigo-300'
          ]">
          <div class="text-xl font-black text-indigo-600 w-7">{{ index + 1 }}</div>
          <img v-if="player.photo" :src="player.photo" class="w-9 h-9 rounded-full object-cover border-2 border-amber-400/60" />
          <div v-else class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-base">⚾</div>
          <div class="flex-1 min-w-0">
            <div :class="[
              'text-slate-900 font-black leading-tight',
              player.name.length > 5 ? 'text-xs break-words' : 'text-sm',
              player.name.length <= 5 ? 'truncate' : ''
            ]">{{ player.name }}</div>
            <div class="text-xs text-slate-500 font-bold truncate">#{{ player.number }}</div>
          </div>
          <!-- 進階模式：守位下拉（可手動更改） -->
          <select v-if="draftLineupPositions"
            :value="draftLineupPositions[index]"
            @change="onPositionChange(index, $event.target.value)"
            @click.stop
            class="text-xs font-black px-1 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-700 flex-shrink-0 w-14 cursor-pointer">
            <option v-for="pos in availablePositionsFor(index)" :key="pos" :value="pos">{{ pos }}</option>
          </select>
        </div>

        <!-- 進階模式：剩餘守位提示 -->
        <div v-if="draftLineupPositions && remainingPositions.length > 0" class="mt-1 mb-1 p-2 bg-emerald-50 rounded-lg border border-emerald-200">
          <div class="text-xs text-emerald-700 font-bold mb-1">剩餘守位：</div>
          <div class="flex flex-wrap gap-1">
            <span v-for="pos in remainingPositions" :key="pos"
              class="text-xs font-black px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-800">{{ pos }}</span>
          </div>
        </div>

        <!-- 未選擇的棒次 -->
        <div v-for="i in (9 - currentLineup.length)" :key="'empty-' + i"
          :class="[
            'p-1.5 rounded-lg flex items-center gap-2 transition-all duration-150',
            i === 1 ? 'bg-indigo-50 border-2 border-indigo-400 animate-pulse shadow-sm' : 'border border-dashed border-slate-300 bg-slate-50'
          ]">
          <div :class="[
            'text-xl font-black w-7',
            i === 1 ? 'text-indigo-600' : 'text-slate-400'
          ]">{{ currentLineup.length + i }}</div>
          <div :class="[
            'italic font-bold text-xs',
            i === 1 ? 'text-indigo-500' : 'text-slate-400'
          ]">{{ i === 1 ? '← 選第' + (currentLineup.length + 1) + '棒' : '未選擇' }}</div>
        </div>
      </div>

      <!-- 投手選擇和按鈕區域 - 固定在底部 -->
      <div class="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm border border-slate-100 pt-3 pb-1 rounded-xl px-3 shadow-md">
        <!-- 投手選擇 -->
        <div class="mb-2 flex-shrink-0">
          <h3 class="text-base font-black text-amber-600 mb-1.5">{{ gameType !== 'single' && !isSelectingAwayTeam ? '主隊投手' : '對戰投手' }}</h3>
          <div v-if="currentPitcher" @click="selectingPitcher = true" class="bg-white border border-amber-200 p-2 rounded-lg flex items-center gap-2 shadow-sm cursor-pointer hover:shadow-md hover:border-amber-400 transition-all duration-150">
            <img v-if="currentPitcher.photo" :src="currentPitcher.photo" class="w-9 h-9 rounded-full object-cover border-2 border-amber-400/60" />
            <div v-else class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-base">⚾</div>
            <div class="flex-1 min-w-0">
              <div class="text-slate-900 font-black text-sm truncate">{{ currentPitcher.name }}</div>
              <div class="text-xs text-amber-600 font-bold">#{{ currentPitcher.number }}</div>
            </div>
            <button @click.stop="$emit('clear-pitcher')" class="text-red-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-full flex-shrink-0 cursor-pointer">
              <XCircleIcon :size="16" />
            </button>
          </div>
          <div v-else-if="isSelectingPitcher" class="w-full py-2.5 rounded-lg font-black text-sm text-center bg-amber-50 text-amber-600 border-2 border-amber-300 border-dashed animate-pulse">
            ← 從左側選擇投手
          </div>
          <button v-else
            :disabled="currentLineup.length < 9"
            @click="selectingPitcher = true"
            :class="[
              'w-full py-2.5 rounded-lg font-black text-sm transition-all duration-150 shadow-sm border cursor-pointer min-h-11',
              currentLineup.length < 9 ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' : 'bg-amber-500 hover:bg-amber-400 text-white border-amber-400'
            ]">
            {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : '選擇投手' }}
          </button>
        </div>

        <button @click="$emit('random-select')" v-if="currentLineup.length === 0 && gameType !== 'advanced'"
          class="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-xl font-bold text-sm mb-1.5 transition-all duration-150 shadow-lg cursor-pointer min-h-11 flex-shrink-0">
          隨機選擇
        </button>
        <button @click="$emit('clear-lineup')" v-if="currentLineup.length > 0"
          class="w-full bg-red-500 hover:bg-red-600 text-white py-1.5 rounded-xl font-bold text-xs mb-1.5 transition-all duration-150 shadow-sm cursor-pointer flex-shrink-0">
          清空打序
        </button>

        <!-- 對戰模式/進階模式的確認按鈕 -->
        <div v-if="gameType === 'versus' || gameType === 'advanced'" class="flex-shrink-0">
          <button v-if="isSelectingAwayTeam" @click="$emit('confirm-away')"
            :disabled="currentLineup.length < 9 || !currentPitcher"
            class="w-full bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:bg-slate-100 disabled:opacity-50 text-white py-3 rounded-xl font-black text-base transition-all duration-150 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:cursor-not-allowed min-h-11 mb-1.5">
            <PlayIcon :fill="true" />
            {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '確認客隊 →') }}
          </button>
          <button v-else @click="$emit('start-game')"
            :disabled="currentLineup.length < 9 || !currentPitcher"
            class="w-full bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:bg-slate-100 disabled:opacity-50 text-white py-3 rounded-xl font-black text-base transition-all duration-150 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:cursor-not-allowed min-h-11">
            <PlayIcon :fill="true" />
            {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '開始比賽！') }}
          </button>
          <button v-if="!isSelectingAwayTeam" @click="$emit('back-to-away')"
            class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl font-bold text-xs transition-all duration-150 shadow-sm cursor-pointer mt-1.5 min-h-11 border border-slate-200">
            ← 返回客隊設定
          </button>
        </div>

        <!-- 單人模式的開始按鈕 -->
        <button v-else-if="gameType === 'single'" @click="$emit('start-game')"
          :disabled="currentLineup.length < 9 || !currentPitcher"
          class="w-full bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:bg-slate-100 disabled:opacity-50 text-white py-3 rounded-xl font-black text-base transition-all duration-150 transform hover:scale-105 disabled:scale-100 flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:cursor-not-allowed min-h-11 flex-shrink-0">
          <PlayIcon :fill="true" />
          {{ currentLineup.length < 9 ? `選擇打者 (${currentLineup.length}/9)` : (!currentPitcher ? '選擇投手' : '開始比賽！') }}
        </button>
      </div>
      <!-- 結束投手和按鈕區域的 absolute div -->
    </div>
    <!-- 結束右側已選打序容器 -->
  </div>
  <!-- 結束主容器 -->
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { XCircleIcon, PlayIcon } from './Icons.vue';

const CPBL_TEAMS = ['樂天桃猿', '統一獅', '富邦悍將', '味全龍', '台鋼雄鷹', '中信兄弟'];

const props = defineProps({
  gameType: String,
  batters: Array,
  pitchers: Array,
  selectedTeam: String,
  teamLogos: Object,
  teamsWithBatters: Array,
  teamsWithPitchers: Array,
  filteredBatters: Array,
  filteredPitchers: Array,
  currentLineup: Array,
  currentPitcher: Object,
  replacingIndex: Number,
  selectedLeague: String,
  isSelectingAwayTeam: Boolean,
  draftLineupPositions: { type: Array, default: null },
});

const emit = defineEmits([
  'back',
  'update:selectedTeam',
  'add-player',
  'replace-player',
  'remove-player',
  'set-pitcher',
  'clear-pitcher',
  'random-select',
  'clear-lineup',
  'confirm-away',
  'start-game',
  'back-to-away',
  'update:selected-league',
  'swap-lineup-positions',
  'update:draft-lineup-position'
]);

const ADVANCED_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const PITCHER_POSITIONS = ['SP', 'RP', 'CP', 'P'];

const showOtherTeams = ref(false);
const showOtherPitcherTeams = ref(false);
const selectingPitcher = ref(false);

// 進階模式：守位篩選 & 換位
const advancedPositionFilter = ref(null);
const swapMode = ref(false);
const swapFirstIndex = ref(-1);

function canPlayerPlayPos(player, position) {
  if (PITCHER_POSITIONS.includes(player.mainPosition)) return false;
  if (position === 'DH') return true; // 任何非投手皆可 DH
  if (!player.mainPosition && !player.otherPositions) return true;
  if (player.mainPosition === position) return true;
  if (player.otherPositions) {
    return player.otherPositions.split('/').map(p => p.trim()).includes(position);
  }
  return false;
}

// 進階模式：尚未被分配的守位
const remainingPositions = computed(() => {
  if (!props.draftLineupPositions) return [];
  const taken = new Set(props.draftLineupPositions.filter(p => p));
  return ADVANCED_POSITIONS.filter(p => !taken.has(p));
});

// 進階模式守位過濾後的打者清單
const advancedFilteredBatters = computed(() => {
  if (props.gameType !== 'advanced' || !advancedPositionFilter.value) return props.filteredBatters;
  const pos = advancedPositionFilter.value;
  return props.filteredBatters.filter(p => canPlayerPlayPos(p, pos));
});

// 取得某個打順槽可選擇的守位（該球員能擔任 + 未被其他槽占用，或就是目前守位）
function availablePositionsFor(index) {
  if (!props.draftLineupPositions) return [];
  const player = props.currentLineup[index];
  if (!player) return [];
  const currentPos = props.draftLineupPositions[index];
  const takenByOthers = new Set(
    props.draftLineupPositions.filter((p, i) => i !== index && p)
  );
  return ADVANCED_POSITIONS.filter(pos =>
    canPlayerPlayPos(player, pos) && (!takenByOthers.has(pos) || pos === currentPos)
  );
}

function onPositionChange(index, newPos) {
  emit('update:draft-lineup-position', index, newPos);
}

function toggleSwapMode() {
  if (swapMode.value && swapFirstIndex.value < 0) {
    // 取消換位
    swapMode.value = false;
  } else if (!swapMode.value) {
    swapMode.value = true;
    swapFirstIndex.value = -1;
  }
}

function onLineupSlotClick(index) {
  if (swapMode.value) {
    if (swapFirstIndex.value < 0) {
      swapFirstIndex.value = index;
    } else if (swapFirstIndex.value === index) {
      swapFirstIndex.value = -1; // 取消選擇
    } else {
      emit('swap-lineup-positions', swapFirstIndex.value, index);
      swapMode.value = false;
      swapFirstIndex.value = -1;
    }
  } else {
    emit('replace-player', index);
  }
}

// Auto-switch to pitcher mode when lineup reaches 9
watch(() => props.currentLineup.length, (len) => {
  if (len === 9 && !props.currentPitcher) {
    selectingPitcher.value = true;
  }
  // 若打線清空，重置換位狀態
  if (len === 0) {
    swapMode.value = false;
    swapFirstIndex.value = -1;
  }
});

watch(() => props.isSelectingAwayTeam, () => {
  swapMode.value = false;
  swapFirstIndex.value = -1;
  advancedPositionFilter.value = null;
});

// Back to batter mode when replacing a batter
watch(() => props.replacingIndex, (idx) => {
  if (idx !== null && idx !== undefined && idx >= 0) {
    selectingPitcher.value = false;
  }
});

// Exit pitcher mode when pitcher is set
watch(() => props.currentPitcher, (p) => {
  if (p) selectingPitcher.value = false;
});

const isSelectingPitcher = computed(() =>
  selectingPitcher.value && (props.replacingIndex === null || props.replacingIndex === undefined || props.replacingIndex < 0)
);

const cpblTeamsWithBatters = computed(() =>
  (props.teamsWithBatters || []).filter(t => CPBL_TEAMS.includes(t))
);
const otherTeamsWithBatters = computed(() =>
  (props.teamsWithBatters || []).filter(t => !CPBL_TEAMS.includes(t))
);
const cpblTeamsWithPitchers = computed(() =>
  (props.teamsWithPitchers || []).filter(t => CPBL_TEAMS.includes(t))
);
const otherTeamsWithPitchers = computed(() =>
  (props.teamsWithPitchers || []).filter(t => !CPBL_TEAMS.includes(t))
);

const isOtherBatterTeamSelected = computed(() =>
  props.selectedTeam !== null && !CPBL_TEAMS.includes(props.selectedTeam)
);
const isOtherPitcherTeamSelected = computed(() =>
  props.selectedTeam !== null && !CPBL_TEAMS.includes(props.selectedTeam)
);

function getBatterCount(team) {
  return (props.batters || []).filter(p => p.team === team).length;
}
function getPitcherCount(team) {
  return (props.pitchers || []).filter(p => p.team === team).length;
}

function selectPitcher(player) {
  emit('set-pitcher', player);
}
</script>
