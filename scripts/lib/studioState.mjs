import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const STUDIO_DIR = '/Users/tonywang/orca/workspaces/baseballvs/chant-studio'

// Stable file-safe batch name: same inputs (any team order) -> same name.
export function batchName({ teams = [], league, org }) {
  const parts = [org, league, ...[...teams].sort()].filter(Boolean)
  return (parts.join('_') || 'all').replace(/[\\/:*?"<>|\s]+/g, '-')
}

const statePath = (batch, dir) => join(dir, `${batch}.json`)

export function loadState(batch, dir = STUDIO_DIR) {
  const file = statePath(batch, dir)
  if (!existsSync(file)) return { batch, cards: {} }
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function saveState(state, dir = STUDIO_DIR) {
  mkdirSync(dir, { recursive: true })
  const file = statePath(state.batch, dir)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2))
  renameSync(tmp, file)
}

// Adds new players as pending cards; existing cards and unlisted players are kept untouched.
export function mergePlayers(state, players) {
  const cards = { ...state.cards }
  for (const pl of players) {
    const id = String(pl.id ?? pl.playerId)
    if (cards[id]) continue
    cards[id] = {
      playerId: id,
      name: pl.name,
      team: pl.team,
      number: pl.number,
      position: pl.main_position ?? pl.position,
      status: 'pending',
      candidates: [],
      chosen: 0,
      fadeMs: 60,
      sliderDb: 0,
      withIntro: false,
    }
  }
  return { ...state, cards }
}
