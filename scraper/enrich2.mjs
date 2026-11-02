/**
 * 用详情接口拿到的完整 JD 覆盖腾讯岗位的 description / requirements。
 * 只更新库里已有的 source_id（upsert，不改 id）。
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'
const H = { 'x-wb-webapp-access-key': KEY, 'Content-Type': 'application/json' }
const BATCH = 20
const MAXLEN = 1800

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const tc = JSON.parse(fs.readFileSync(path.join(here, 'data', 'tencent_all.json'), 'utf8'))
const detail = JSON.parse(fs.readFileSync(path.join(here, 'tmp', 'tc_detail.json'), 'utf8'))

const clean = (t) => (t || '').replace(/\r/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, MAXLEN) || null

const ids = []
for (let frm = 0; ; frm += 1000) {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=source_id&source=eq.tencent&limit=1000&offset=${frm}`, { headers: H })
  const b = await r.json()
  ids.push(...b.map((x) => x.source_id))
  if (b.length < 1000) break
}
const have = new Set(ids)
const pool = new Map(tc.items.map((x) => [String(x.source_id), x]))

const rows = []
for (const [pid, d] of Object.entries(detail)) {
  if (!have.has(pid)) continue
  const x = pool.get(pid)
  if (!x) continue
  rows.push({
    company_id: 1,
    title: (x.title || '').slice(0, 100),
    city: x.city || null,
    experience: x.experience || '不限',
    tags: ['计算机', x.category || '其他'],
    description: clean(d.resp),
    requirements: clean(d.req),
    source: 'tencent',
    source_id: pid,
    published_at: x.published_at,
  })
}
console.log('待更新腾讯岗位', rows.length)

async function push(chunk) {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?on_conflict=source,source_id`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(chunk),
  })
  if (r.ok) return chunk.length
  if (r.status === 403 && chunk.length > 5) {
    const mid = Math.floor(chunk.length / 2)
    await new Promise((s) => setTimeout(s, 350))
    return (await push(chunk.slice(0, mid))) + (await push(chunk.slice(mid)))
  }
  console.log('失败', r.status, (await r.text()).slice(0, 160))
  return 0
}

let done = 0
for (let i = 0; i < rows.length; i += BATCH) {
  done += await push(rows.slice(i, i + BATCH))
  await new Promise((s) => setTimeout(s, 220))
}
console.log('完成', done)
