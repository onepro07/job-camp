/**
 * 把云数据库里的岗位导出成静态 JSON，随 GitHub Pages 一起分发。
 *
 * 为什么需要它：云网关按 Origin 白名单校验，只认官方托管域名。
 * GitHub Pages（*.github.io）下浏览器直连会被 403，页面会是空的。
 * 把数据打进产物后，页面读同源文件，不依赖任何跨域请求。
 *
 * 产物（形状与 src/api.ts 的返回值一致，前端无需改动）：
 *   public/data/index.json        轻量索引（列表页用）
 *   public/data/bucket-{n}.json   完整数据分片（详情页按需加载，每 100 条一片）
 *   public/data/buckets.json      分片清单（id → 文件映射）
 *
 * 用法：node scripts/export-static.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/data')
const PAGE = 1000

const ENDPOINT = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'

// 索引只保留列表页真正要用的列：筛选（city/experience/tags/company）、
// 排序（published_at）、展示（title）。其余字段（薪资、学历、职责原文）都在分片里，
// 冗余放进索引会让首屏多下载一两兆。
const SELECT_LIGHT = 'id,title,city,experience,tags,published_at,company:companies(name,industry)'
const SELECT_FULL = '*,company:companies(id,name,industry,company_size,city,website,intro)'

async function fetchPage(select, offset) {
  const url = `${ENDPOINT}/.cloud/database/rest/v1/jobs?select=${encodeURIComponent(select)}&limit=${PAGE}&offset=${offset}`
  const res = await fetch(url, {
    headers: { 'x-wb-webapp-access-key': KEY, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function fetchAll(select, label) {
  const out = []
  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchPage(select, offset)
    out.push(...rows)
    console.log(`  ${label} 第 ${offset / PAGE + 1} 页：${rows.length} 条（累计 ${out.length}）`)
    if (rows.length < PAGE) break
  }
  return out
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

/** 与 src/api.ts 的 interleave 一致：按公司轮转，避免前几页被同一家占满 */
function interleave(rows) {
  const byCompany = new Map()
  for (const j of rows) {
    const k = j.company?.name ?? '未知企业'
    if (!byCompany.has(k)) byCompany.set(k, [])
    byCompany.get(k).push(j)
  }
  const buckets = [...byCompany.values()]
  const out = []
  for (let i = 0; buckets.some((b) => b[i]); i++) {
    for (const b of buckets) if (b[i]) out.push(b[i])
  }
  return out
}

async function main() {
  await mkdir(OUT, { recursive: true })

  const light = interleave(await fetchAll(SELECT_LIGHT, '索引'))
  const indexJson = JSON.stringify(light)
  await writeFile(resolve(OUT, 'index.json'), indexJson)
  console.log(`\nindex.json：${light.length} 条，${kb(indexJson.length)}`)

  const full = (await fetchAll(SELECT_FULL, '全文')).sort((a, b) => a.id - b.id)
  const BUCKET = 100
  const manifest = []
  for (let i = 0; i < full.length; i += BUCKET) {
    const slice = full.slice(i, i + BUCKET)
    const name = `bucket-${Math.floor(i / BUCKET)}.json`
    const json = JSON.stringify(slice)
    await writeFile(resolve(OUT, name), json)
    manifest.push({ file: name, from: slice[0].id, to: slice[slice.length - 1].id, count: slice.length })
    console.log(`${name}：${slice.length} 条，${kb(json.length)}`)
  }
  await writeFile(resolve(OUT, 'buckets.json'), JSON.stringify(manifest))
  console.log(`\n完成：${full.length} 条完整岗位，${manifest.length} 个分片`)
}

main().catch((e) => {
  console.error('导出失败：', e)
  process.exit(1)
})
