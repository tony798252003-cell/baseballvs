// scripts/lib/env.mjs
import { createClient } from '@supabase/supabase-js'

export function loadEnv() {
  try {
    process.loadEnvFile('.env')
  } catch {
    // .env is optional; variables may already be in the environment
  }
}

export function createServiceClient() {
  for (const name of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (!process.env[name]) {
      console.error(`Missing ${name}. Set it in .env (see .env.example).`)
      process.exit(1)
    }
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}
