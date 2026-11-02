/**
 * 批量导入岗位到云数据库。
 *
 * 走云服务的 PostgREST 接口（{endpoint}/.cloud/database/rest/v1/{table}），
 * 用发布密钥做 webapp 鉴权头。数据从 scraper/data/tencent_all.json 读，
 * 不经过人工中转，一次可导入数百条。
 *
 * 用法：node import_jobs.mjs [目标总数]
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'
const H = { 'x-wb-webapp-access-key': KEY, 'Content-Type': 'application/json' }
const TARGET = Number(process.argv[2] || 500)
const BATCH = 100

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const raw = JSON.parse(fs.readFileSync(path.join(here, 'data', 'tencent_all.json'), 'utf8'))

async function countAll() {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=id`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number((r.headers.get('content-range') || '0/0').split('/')[1] || 0)
}

async function existingIds() {
  const out = new Set()
  let from = 0
  for (;;) {
    const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=source_id&offset=${from}&limit=1000`, { headers: H })
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const x of rows) out.add(String(x.source_id))
    if (rows.length < 1000) break
    from += 1000
  }
  return out
}

/** 职责原文压成一段可读文本，去掉“1. 负责…”的行号与多余空白。 */
function clean(text) {
  if (!text) return null
  return text
    .replace(/\r/g, '')
    .replace(/[；;]\s*/g, '；')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

const before = await countAll()
console.log(`当前库内岗位：${before}`)
if (before >= TARGET) {
  console.log('已达到目标，无需导入')
  process.exit(0)
}

const seen = await existingIds()
const need = TARGET - before

const pool = raw.items
  .filter((x) => x.title && x.source_id && !seen.has(String(x.source_id)))
  .map((x) => ({
    company_id: 1,
    title: x.title.slice(0, 80),
    city: x.city || null,
    experience: x.experience || '不限',
    tags: [x.bg || null, x.category || null].filter(Boolean),
    description: clean(x.responsibility),
    source: 'tencent',
    source_id: String(x.source_id),
    published_at: x.published_at,
  }))

console.log(`可导入新岗位：${pool.length}，本次需要：${need}`)
const todo = pool.slice(0, need)

let done = 0
for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH)
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(chunk),
  })
  if (!r.ok) {
    console.log(`第 ${i / BATCH + 1} 批失败 ${r.status}: ${(await r.text()).slice(0, 200)}`)
    break
  }
  done += chunk.length
  console.log(`第 ${i / BATCH + 1} 批 +${chunk.length}，累计 ${done}`)
  await new Promise((s) => setTimeout(s, 250))
}

console.log(`\n导入完成：新增 ${done} 条，库内合计 ${await countAll()} 条`)
