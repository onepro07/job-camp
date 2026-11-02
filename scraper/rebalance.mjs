/**
 * 重排岗位城市分布。
 *
 * 抓取顺序是按腾讯岗位更新时间的，深圳占了 6 成，直接入库会让筛选栏失真
 * （深圳 308、武汉 1）。这里按各城市配额从池子里抽样，重建成 500 条，
 * 让城市/经验分布接近真实招聘市场的观感。
 *
 * 用法：node rebalance.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'
const H = { 'x-wb-webapp-access-key': KEY, 'Content-Type': 'application/json' }
const TARGET = 500
const BATCH = 100

const QUOTA = { 深圳: 150, 上海: 88, 北京: 82, 广州: 80, 成都: 36, 杭州: 28 }

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const raw = JSON.parse(fs.readFileSync(path.join(here, 'data', 'tencent_all.json'), 'utf8'))

function clean(text) {
  if (!text) return null
  return text.replace(/\r/g, '').replace(/[；;]\s*/g, '；').replace(/\s+/g, ' ').trim().slice(0, 160)
}

async function countAll() {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=id`, {
    headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
  })
  return Number((r.headers.get('content-range') || '0/0').split('/')[1] || 0)
}

// 按城市分组（保持池子原顺序，等于“最新在前”）
const byCity = new Map()
for (const x of raw.items) {
  if (!x.title || !x.source_id) continue
  if (!byCity.has(x.city)) byCity.set(x.city, [])
  byCity.get(x.city).push(x)
}

const picked = []
const used = new Set()
function take(city, n) {
  const list = byCity.get(city) || []
  let got = 0
  for (const x of list) {
    if (got >= n) break
    if (used.has(x.source_id)) continue
    picked.push(x); used.add(x.source_id); got++
  }
  return got
}

// 先按配额取主力城市
for (const [city, n] of Object.entries(QUOTA)) take(city, n)
// 再把其余城市全部纳入（含港澳台、海外、西安等）
const rest = [...byCity.keys()].filter((c) => !(c in QUOTA)).sort()
for (const city of rest) take(city, (byCity.get(city) || []).length)
// 不足补深圳
if (picked.length < TARGET) take('深圳', TARGET - picked.length)
// 超出（小城市太多时）从深圳尾部裁掉
const final = picked.slice(0, TARGET)

const rows = final.map((x) => ({
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

const dist = {}
for (const r of rows) dist[r.city] = (dist[r.city] || 0) + 1
console.log('本次重建条数：', rows.length)
console.log('城市分布：', Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '))

console.log('清空旧数据…')
const del = await fetch(`${EP}/.cloud/database/rest/v1/jobs?source=eq.tencent`, {
  method: 'DELETE',
  headers: { ...H, Prefer: 'return=minimal' },
})
console.log('  delete ->', del.status, del.ok ? '' : (await del.text()).slice(0, 200))
if (!del.ok) process.exit(1)

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(chunk),
  })
  if (!r.ok) {
    console.log(`第 ${i / BATCH + 1} 批失败 ${r.status}: ${(await r.text()).slice(0, 300)}`)
    process.exit(1)
  }
  console.log(`第 ${i / BATCH + 1} 批 +${chunk.length}`)
  await new Promise((s) => setTimeout(s, 250))
}

console.log(`\n完成，库内合计 ${await countAll()} 条`)
