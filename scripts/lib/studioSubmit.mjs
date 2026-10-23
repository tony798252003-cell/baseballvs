// 應援曲工作台送出：對已解決的卡片產生成品 → 上傳 Dropbox → 寫入 players.song／intro。外部動作全部由呼叫端注入。
import { join } from 'node:path'
import { computeGainDb } from './audioCut.mjs'
import { STUDIO_DIR } from './studioState.mjs'

const DROPBOX_DIR = '/Music/Players'
const isEmpty = (v) => v == null || String(v).trim() === ''

/**
 * Processes resolved, not-yet-uploaded cards one at a time (skipping busyId, the card the pipeline holds).
 * The player row is re-read right before writing: a non-empty song skips the card, a non-empty intro
 * skips only the intro. Filenames use the DB row's team/name. Saves state after each card.
 * deps: readPlayer(id) -> row|null, render(renderPair opts), upload(localPath, dropboxPath), link(dropboxPath) -> url,
 *       writePlayer(id, patch), save(state), log(msg)
 */
export async function submitApproved(state, { readPlayer, render, upload, link, writePlayer, save, log = () => {} },
  { studioDir = STUDIO_DIR, busyId = null, onStart } = {}) {
  const summary = { uploaded: [], skipped: [], failed: [] }
  const ready = (id) => state.cards[id]?.status === 'resolved' && !state.cards[id].uploaded && id !== busyId
  for (const id of Object.keys(state.cards).filter(ready)) {
    if (!ready(id)) continue // edited back to pending/skipped while earlier cards were uploading
    const card = state.cards[id]
    onStart?.(id)
    let label = `${card.team} - ${card.name}`
    try {
      const player = await readPlayer(id)
      if (!player) throw new Error('資料庫找不到這位球員')
      label = `${player.team} - ${player.name}`
      if (!isEmpty(player.song)) {
        summary.skipped.push({ name: label, reason: '已有歌' })
        log(`↷ ${label}：已有歌`)
        continue
      }
      const introTaken = card.withIntro && !isEmpty(player.intro)
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
      const patch = { song: await link(songRemote) }
      if (introPath) {
        const introRemote = `${DROPBOX_DIR}/${label} - Intro.mp3`
        await upload(introPath, introRemote)
        patch.intro = await link(introRemote)
      }
      await writePlayer(id, patch)
      card.uploaded = { song: patch.song, intro: patch.intro ?? null }
      await save(state)
      summary.uploaded.push(label)
      log(`✓ ${label}`)
      if (introTaken) {
        summary.skipped.push({ name: label, reason: '已有 intro，略過前奏' })
        log(`↷ ${label}：已有 intro，略過前奏`)
      }
    } catch (e) {
      summary.failed.push({ name: label, error: e.message })
      log(`✗ ${label}：${e.message}`)
    }
  }
  return summary
}
