import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upsertEnvVar } from './envFile.mjs'

test('replaces an existing key in place and leaves other lines untouched (so .env secrets/comments survive)', () => {
  const text = '# c\nA=1\nDROPBOX_REFRESH_TOKEN=old\nB=2\n'
  assert.equal(upsertEnvVar(text, 'DROPBOX_REFRESH_TOKEN', 'new'), '# c\nA=1\nDROPBOX_REFRESH_TOKEN=new\nB=2\n')
})

test('appends a missing key on its own line, even when the file lacks a trailing newline', () => {
  assert.equal(upsertEnvVar('A=1', 'K', 'v'), 'A=1\nK=v\n')
  assert.equal(upsertEnvVar('A=1\n', 'K', 'v'), 'A=1\nK=v\n')
  assert.equal(upsertEnvVar('', 'K', 'v'), 'K=v\n')
})

test('does not match a key that merely has the target as a prefix or suffix', () => {
  assert.equal(upsertEnvVar('XK=1\nKK=2\n', 'K', 'v'), 'XK=1\nKK=2\nK=v\n')
})
