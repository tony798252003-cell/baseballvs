import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ehevruywqvpdbzveqxum.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoZXZydXl3cXZwZGJ6dmVxeHVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzcxNjcxMiwiZXhwIjoyMDg5MjkyNzEyfQ.KoZ4QUoftI0fjHydy8POsyccPZg0-AG8-WQ1HgZ5nug'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
