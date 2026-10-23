#!/usr/bin/env node
// scripts/dropbox-auth.mjs — one-time OAuth: exchange an authorization code for a refresh token and store it in .env
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { loadEnv } from './lib/env.mjs'
import { upsertEnvVar } from './lib/envFile.mjs'

loadEnv()

const { DROPBOX_APP_KEY: key, DROPBOX_APP_SECRET: secret } = process.env
if (!key || !secret) {
  console.error('❌ 缺少 DROPBOX_APP_KEY / DROPBOX_APP_SECRET，請在 .env 設定（參考 .env.example）')
  process.exit(1)
}

console.log('請在瀏覽器開啟並授權：')
console.log(`https://www.dropbox.com/oauth2/authorize?client_id=${key}&token_access_type=offline&response_type=code`)

const rl = createInterface({ input: process.stdin, output: process.stdout })
const code = (await rl.question('貼上授權碼：')).trim()
rl.close()

const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
  method: 'POST',
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ grant_type: 'authorization_code', code }).toString(),
})
if (!res.ok) {
  console.error(`❌ 授權碼交換失敗 (${res.status})`)
  process.exit(1)
}
const { refresh_token } = await res.json()
if (!refresh_token) {
  console.error('❌ 回應中沒有 refresh_token（授權網址需含 token_access_type=offline）')
  process.exit(1)
}

let envText = ''
try {
  envText = readFileSync('.env', 'utf8')
} catch {
  // no .env yet; upsertEnvVar will create the content
}
writeFileSync('.env', upsertEnvVar(envText, 'DROPBOX_REFRESH_TOKEN', refresh_token))
console.log('✓ 已寫入 .env')
