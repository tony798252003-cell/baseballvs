// scripts/lib/sharedLinkPath.mjs
// Dropbox shared link -> path_lower, with retry, used by scripts/normalize-music.mjs --apply.
import { toSharedLinkUrl } from './normalizePlan.mjs'

const API = 'https://api.dropboxapi.com/2/sharing/get_shared_link_metadata'
const MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 500
const LOOKUP_GAP_MS = 100

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

// The link is dead or the file is not in this account: it cannot be uploaded to, and cannot collide
// with a path we upload to.
export class LinkNotResolvable extends Error {}

/**
 * Retries 429/5xx/network errors (honouring Retry-After) up to MAX_ATTEMPTS.
 * Throws LinkNotResolvable for 404 / shared_link_not_found / no path_lower; any other error is thrown as is.
 */
export async function sharedLinkPath(token, url, { fetchImpl = fetch, sleep = defaultSleep } = {}) {
  for (let attempt = 1; ; attempt++) {
    let res
    try {
      res = await fetchImpl(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: toSharedLinkUrl(url) }),
      })
    } catch (e) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`查分享連結路徑失敗（網路，${attempt} 次）：${e.message}`)
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1))
      continue
    }
    if (res.ok) {
      const meta = await res.json()
      if (!meta.path_lower) throw new LinkNotResolvable('分享連結沒有路徑（檔案不在此 Dropbox 帳號內？）')
      return meta.path_lower
    }
    const body = await res.text()
    if (res.status === 404 || (res.status === 409 && body.includes('shared_link_not_found'))) {
      throw new LinkNotResolvable(`分享連結已失效 ${res.status}`)
    }
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BASE_BACKOFF_MS * 2 ** (attempt - 1))
      continue
    }
    throw new Error(`查分享連結路徑失敗 ${res.status}（${attempt} 次）：${body}`)
  }
}

/**
 * Looks up every key sequentially with a small gap. Returns Map key -> { path } | { unresolvable } | { error }.
 */
export async function lookupPaths(token, urlByKey, { fetchImpl = fetch, sleep = defaultSleep, onProgress = () => {} } = {}) {
  const out = new Map()
  let n = 0
  for (const [key, url] of urlByKey) {
    if (n++) await sleep(LOOKUP_GAP_MS)
    onProgress(n, urlByKey.size)
    try {
      out.set(key, { path: await sharedLinkPath(token, url, { fetchImpl, sleep }) })
    } catch (e) {
      out.set(key, e instanceof LinkNotResolvable ? { unresolvable: e.message } : { error: e.message })
    }
  }
  return out
}
