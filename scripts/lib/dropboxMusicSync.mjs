// scripts/lib/dropboxMusicSync.mjs

export const TEAM_FOLDER_MAP = {
  Brothers: '中信兄弟',
  Lions: '統一獅',
  Fubon: '富邦悍將',
  Dragons: '味全龍',
  Hawks: '台鋼雄鷹',
  Monkeys: '樂天桃猿',
}

export function fuzzyNameMatch(a, b) {
  const x = (a || '').trim()
  const y = (b || '').trim()
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

// "5林襄.mp3" -> { number: '5', name: '林襄', isIntro: false }
// "5林襄-Intro.mp3" -> { number: '5', name: '林襄', isIntro: true }
// "林襄intro.mp3" -> { number: null, name: '林襄', isIntro: true }
export function parseLegacyFilename(filename) {
  let base = filename.replace(/\.mp3$/i, '')

  const introMatch = base.match(/^(.*?)[\s\-_]*intro$/i)
  const isIntro = !!introMatch
  if (isIntro) base = introMatch[1]

  const numberMatch = base.match(/^(\d+)(.*)$/)
  const number = numberMatch ? numberMatch[1] : null
  const name = (numberMatch ? numberMatch[2] : base).trim()

  return { number, name, isIntro }
}

export async function listDropboxFolder(token, path) {
  const res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    throw new Error(`列出資料夾失敗 (${path}): ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  return data.entries.filter(e => e['.tag'] === 'file' && e.name.toLowerCase().endsWith('.mp3'))
}

export async function uploadToDropbox(token, localFilePath, dropboxPath) {
  const fs = await import('node:fs')
  const fileBuffer = fs.readFileSync(localFilePath)
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath, mode: 'overwrite', autorename: false, mute: true }),
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  })
  if (!res.ok) {
    throw new Error(`上傳失敗 (${dropboxPath}): ${res.status} ${await res.text()}`)
  }
}

export async function moveDropboxFile(token, fromPath, toPath) {
  const res = await fetch('https://api.dropboxapi.com/2/files/move_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from_path: fromPath, to_path: toPath, autorename: false }),
  })
  if (!res.ok) {
    throw new Error(`搬移失敗 (${fromPath} -> ${toPath}): ${res.status} ${await res.text()}`)
  }
}

export async function getSharedLinkRawUrl(token, dropboxPath) {
  const res = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: dropboxPath, settings: { requested_visibility: 'public' } }),
  })

  let url = ''
  if (res.status === 409) {
    const errData = await res.json()
    url = errData?.error?.shared_link_already_exists?.metadata?.url || ''
  } else if (res.ok) {
    const data = await res.json()
    url = data.url || ''
  } else {
    throw new Error(`建立分享連結失敗 (${dropboxPath}): ${res.status} ${await res.text()}`)
  }

  if (!url) throw new Error(`未取得分享連結 (${dropboxPath})`)

  return url.includes('?dl=0')
    ? url.replace('?dl=0', '?raw=1')
    : url + (url.includes('?') ? '&raw=1' : '?raw=1')
}
