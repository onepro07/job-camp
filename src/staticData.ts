/**
 * 静态数据后端：从随页面分发的 JSON 里读岗位，完全不发跨域请求。
 *
 * 什么时候会用到：站点部署到 GitHub Pages（*.github.io）这类域名时，云网关会按
 * Origin 白名单拒绝浏览器的请求（403），页面会是空的。把数据导出成
 * public/data/*.json 一起分发后，读同源文件即可，手机打开也有内容。
 *
 * 数据由 scripts/export-static.mjs 生成：
 *   index.json        轻量索引，列表/筛选/计数都靠它（约 570KB）
 *   bucket-{n}.json   完整数据分片，详情页按需加载（每片约 100KB）
 */
import type { Job } from './types'

export interface JobIndexRow {
  id: number
  title: string
  city: string | null
  experience: string | null
  tags: string[] | null
  published_at: string | null
  company: { name: string } | null
}

interface BucketMeta {
  file: string
  from: number
  to: number
  count: number
}

let indexCache: JobIndexRow[] | null = null
let manifest: BucketMeta[] | null = null
const bucketCache = new Map<string, Job[]>()

/**
 * 拉取静态索引；产物不存在时返回 null（调用方应回退到云端数据源）。
 * 用 HEAD 之外的一次 GET 探测：GitHub Pages 对不存在的文件返回 404，正好用来判断。
 */
export async function loadStaticIndex(): Promise<JobIndexRow[] | null> {
  if (indexCache) return indexCache
  try {
    const res = await fetch('data/index.json')
    if (!res.ok) return null
    const rows = (await res.json()) as JobIndexRow[]
    if (!Array.isArray(rows) || rows.length === 0) return null
    indexCache = rows
    return rows
  } catch {
    return null
  }
}

async function loadManifest(): Promise<BucketMeta[]> {
  if (manifest) return manifest
  const res = await fetch('data/buckets.json')
  if (!res.ok) throw new Error(`分片清单读取失败：HTTP ${res.status}`)
  manifest = (await res.json()) as BucketMeta[]
  return manifest
}

/** 找出 id 落在哪个分片，只加载那一片（每片约 100KB，比一次拉全量省得多）。 */
async function findBucket(id: number): Promise<Job | null> {
  const list = await loadManifest()
  const meta = list.find((m) => id >= m.from && id <= m.to)
  if (!meta) return null

  let bucket = bucketCache.get(meta.file)
  if (!bucket) {
    const res = await fetch(`data/${meta.file}`)
    if (!res.ok) throw new Error(`${meta.file} 读取失败：HTTP ${res.status}`)
    bucket = (await res.json()) as Job[]
    bucketCache.set(meta.file, bucket)
  }
  return bucket.find((j) => j.id === id) ?? null
}

/** 按 id 批量取完整岗位，缺数据的 id 直接跳过。 */
export async function loadStaticJobsByIds(ids: number[]): Promise<Job[]> {
  const list = await loadManifest()
  const wanted = new Set(ids)
  const files = list.filter((m) => ids.some((id) => id >= m.from && id <= m.to))

  const rows: Job[] = []
  for (const meta of files) {
    let bucket = bucketCache.get(meta.file)
    if (!bucket) {
      const res = await fetch(`data/${meta.file}`)
      if (!res.ok) continue
      bucket = (await res.json()) as Job[]
      bucketCache.set(meta.file, bucket)
    }
    for (const j of bucket) if (wanted.has(j.id)) rows.push(j)
  }
  return rows
}

export async function loadStaticJob(id: number): Promise<Job | null> {
  return findBucket(id)
}
