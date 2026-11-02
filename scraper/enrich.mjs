/**
 * 给已入库的岗位补齐「任职要求」和完整 JD。
 *
 * 之前为了压体积，职责只存了 160~200 字；详情页要做好就得有全文。
 * 这里用 PostgREST 的 upsert（on_conflict=source,source_id + merge-duplicates）
 * 原地更新，不新增、不删除，岗位 id 保持不变（收藏/投递引用不会断）。
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'
const H = { 'x-wb-webapp-access-key': KEY, 'Content-Type': 'application/json' }
const BATCH = 20
const MAXLEN = 1600

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const tc = JSON.parse(fs.readFileSync(path.join(here, 'data', 'tencent_all.json'), 'utf8'))
const bs = JSON.parse(fs.readFileSync(path.join(here, 'data', 'beisen2.json'), 'utf8'))

const clean = (t) => (t || '').replace(/\r/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, MAXLEN) || null

async function existing() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=id,source,source_id&limit=1000&offset=${from}`, { headers: H })
    const b = await r.json()
    rows.push(...b)
    if (b.length < 1000) break
  }
  return rows
}

async function companies() {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/companies?select=id,name&limit=300`, { headers: H })
  const m = new Map()
  for (const c of await r.json()) m.set(c.name, c.id)
  return m
}

const db = await existing()
const comp = await companies()
const tcIds = new Set(db.filter((r) => r.source === 'tencent').map((r) => r.source_id))
const bsIds = new Set(db.filter((r) => r.source === 'beisen').map((r) => r.source_id))

const rows = []
const tcMap = new Map(tc.items.map((x) => [String(x.source_id), x]))
for (const id of tcIds) {
  const x = tcMap.get(id)
  if (!x) continue
  rows.push({
    company_id: comp.get('腾讯'),
    title: (x.title || '').slice(0, 100),
    city: x.city || null,
    experience: x.experience || '不限',
    tags: ['计算机', x.category || '其他'],
    description: clean(x.responsibility),
    requirements: clean(x.requirement),
    source: 'tencent',
    source_id: id,
    published_at: x.published_at,
  })
}

const industryOf = new Map(bs.companies.map((c) => [c.name, c.industry]))
for (const j of bs.jobs) {
  if (!bsIds.has(j.source_id)) continue
  rows.push({
    company_id: comp.get(j.company),
    title: j.title.slice(0, 100),
    city: j.city || null,
    experience: j.years || '不限',
    tags: [industryOf.get(j.company) || '综合', j.func],
    description: clean(j.duty),
    requirements: clean(j.require),
    source: 'beisen',
    source_id: j.source_id,
    published_at: j.published_at,
  })
}

console.log(`待更新 ${rows.length} 条（腾讯 ${tcIds.size} / 企业官网 ${bsIds.size}）`)

async function push(chunk) {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?on_conflict=source,source_id`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify(chunk),
  })
  if (r.ok) return chunk.length
  // 单批太大时网关卡会返回 403（WAF），拆半重试
  if (r.status === 403 && chunk.length > 5) {
    const mid = Math.floor(chunk.length / 2)
    await new Promise((s) => setTimeout(s, 400))
    return (await push(chunk.slice(0, mid))) + (await push(chunk.slice(mid)))
  }
  console.log(`失败 ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return 0
}

let done = 0
for (let i = 0; i < rows.length; i += BATCH) {
  done += await push(rows.slice(i, i + BATCH))
  if ((i / BATCH) % 5 === 0) console.log(`  已更新 ${done}/${rows.length}`)
  await new Promise((s) => setTimeout(s, 250))
}
console.log(`完成：${done} 条`)
