// 應援曲工作台送出：對已解決的卡片產生成品 → 上傳 Dropbox → 寫入 players.song／intro。外部動作全部由呼叫端注入。
import { join } from 'node:path'
import { computeGainDb } from './audioCut.mjs'
import { STUDIO_DIR } from './studioState.mjs'

const DROPBOX_DIR = '/Music/Players'
const isEmpty = (v) => v == null || String(v).trim() === ''
// A team/name that would change or escape the Dropbox path: slash, surrounding whitespace, trailing dot.
const unsafeNamePart = (s) => typeof s !== 'string' || !s || s.includes('/') || s !== s.trim() || s.endsWith('.')

/**
 * Processes resolved, not-yet-uploaded cards one at a time (skipping busyId, the card the pipeline holds).
 * The player row is re-read right before writing: a non-empty song skips the card, a non-empty intro
 * skips only the intro. Filenames use the DB row's team/name. Saves state after each card.
 * deps: readPlayer(id) -> row|null, findNameConflict(row) -> boolean (another row with the same team+name
 *       already has song/intro), render(renderPair opts), upload(localPath, dropboxPath), link(dropboxPath) -> url,
 *       writePlayer(id, patch) -> rows written (the caller writes only while every patched column is still empty),
 *       save(state), log(msg)
 */
export async function submitApproved(state, { readPlayer, findNameConflict, render, upload, link, writePlayer, save, log = () => {} },
  { studioDir = STUDIO_DIR, busyId = null, onStart } = {}) {
  const summary = { uploaded: [], skipped: [], failed: [] }
  const ready = (id) => state.cards[id]?.status === 'resolved' && !state.cards[id].uploaded && id !== busyId
  for (const id of Object.keys(state.cards).filter(ready)) {
    if (!ready(id)) continue // edited back to pending/skipped while earlier cards were uploading
    const card = state.cards[id]
    onStart?.(id)
    let label = `${card.team} - ${card.name}`
    const fail = (error) => {
      summary.failed.push({ name: label, error })
      log(`✗ ${label}：${error}`)
    }
    try {
      const player = await readPlayer(id)
      if (!player) throw new Error('資料庫找不到這位球員')
      label = `${player.team} - ${player.name}`
      if (!isEmpty(player.song)) {
        summary.skipped.push({ name: label, reason: '已有歌' })
        log(`↷ ${label}：已有歌`)
        continue
      }
      if (unsafeNamePart(player.team) || unsafeNamePart(player.name)) throw new Error('檔名含不允許的字元')
      // Same team+name means the same Dropbox path: uploading would overwrite the other player's file.
      if (await findNameConflict(player)) throw new Error('同隊同名球員已有檔案，未上傳')
      let introTaken = card.withIntro && !isEmpty(player.intro)
      const { songPath, introPath } = await render({
        src: join(studioDir, card.original),
        outDir: join(studioDir, state.batch, 'render', id),
        A: card.A,
        B: card.B,
        fadeMs: card.fadeMs,
        gainDb: computeGainDb({ integratedLufs: card.integratedLufs, sliderDb: card.sliderDb }),
        withIntro: card.withIntro && !introTaken,
      })
      const songRemote = `${DROPBOX_DIR}/${label}.mp3`
      await upload(songPath, songRemote)
      let patch = { song: await link(songRemote) }
      if (introPath) {
        const introRemote = `${DROPBOX_DIR}/${label} - Intro.mp3`
        await upload(introPath, introRemote)
        patch.intro = await link(introRemote)
      }
      let written = await writePlayer(id, patch)
      if (written !== 1 && patch.intro) {
        // song or intro got filled meanwhile; an intro-only conflict still lets the song through
        patch = { song: patch.song }
        written = await writePlayer(id, patch)
        introTaken = written === 1
      }
      if (written !== 1) throw new Error('寫入前歌曲已被填入，未寫入')
      card.uploaded = { song: patch.song, intro: patch.intro ?? null }
      if (introTaken) summary.skipped.push({ name: label, reason: '已有 intro，略過前奏' })
      try {
        await save(state)
      } catch (e) {
        // card.uploaded stays in memory so a retry in this session will not upload again
        fail(`已寫入資料庫，但狀態存檔失敗：${e.message}`)
        continue
      }
      summary.uploaded.push(label)
      log(`✓ ${label}${introTaken ? '（已有 intro，略過前奏）' : ''}`)
    } catch (e) {
      fail(e.message)
    }
  }
  return summary
}

/**
 * One submit at a time: request() runs runSubmit(onStart) or answers 409 while one is running.
 * currentId() is the card being submitted (null when idle or between cards) so card edits can be refused.
 */
export function createSubmitter(runSubmit) {
  let active = null // null = idle, { id } while running
  return {
    currentId: () => active?.id ?? null,
    async request() {
      if (active) return { status: 409, body: { error: '送出進行中，請稍候' } }
      active = { id: null }
      try {
        return { status: 200, body: await runSubmit((id) => { active.id = id }) }
      } finally {
        active = null
      }
    },
  }
}
