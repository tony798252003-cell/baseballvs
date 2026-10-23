// scripts/lib/envFile.mjs

// Replace `KEY=...` in .env text, or append it; all other lines are preserved.
export function upsertEnvVar(envText, key, value) {
  const line = `${key}=${value}`
  const lines = envText.split('\n')
  const idx = lines.findIndex(l => l.startsWith(`${key}=`))
  if (idx >= 0) {
    lines[idx] = line
    return lines.join('\n')
  }
  const base = envText === '' || envText.endsWith('\n') ? envText : envText + '\n'
  return `${base}${line}\n`
}
