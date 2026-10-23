<template>
  <div class="w-full h-full bg-slate-900 text-white flex items-center justify-center p-4">
    <form @submit.prevent="login" class="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 flex flex-col gap-4">
      <h1 class="text-xl font-bold">🔒 管理員登入</h1>
      <input v-model="email" type="email" placeholder="Email" autocomplete="username" required
        class="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" />
      <input v-model="password" type="password" placeholder="密碼" autocomplete="current-password" required
        class="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-400" />
      <div v-if="errorMsg" class="text-red-400 text-sm">❌ {{ errorMsg }}</div>
      <div class="flex gap-3">
        <button type="button" @click="$emit('back')" class="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg text-sm transition">← 返回</button>
        <button type="submit" :disabled="loading"
          class="flex-1 bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold px-4 py-2 rounded-lg text-sm transition disabled:opacity-50">
          {{ loading ? '登入中...' : '登入' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { supabase } from '../lib/supabase.js'

const emit = defineEmits(['logged-in', 'back'])

const email = ref('tony798252003@gmail.com')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function login() {
  loading.value = true
  errorMsg.value = ''
  const { error } = await supabase.auth.signInWithPassword({ email: email.value, password: password.value })
  loading.value = false
  if (error) { errorMsg.value = '登入失敗，請檢查帳號或密碼'; return }
  emit('logged-in')
}
</script>
