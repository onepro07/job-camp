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
 * 带重试的 JSON 读取。
 *
 * 为什么需要：新部署的站点第一次访问要走 CDN 回源，偶尔会超时。
 * 一旦索引读取被判定成「不存在」，页面会退化到云端模式 —— 在 GitHub Pages 上
 * 没有后端可用，结果就是一直停在「加载中」。多试一次成本极低，能避免这种白屏。
 */
async function fetchJson<T>(path: string, tries = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(path, i === 0 ? undefined : { cache: 'reload' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as T
    } catch (e) {
      lastErr = e
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
  throw lastErr
}

/**
 * 拉取静态索引；产物不存在时返回 null（调用方应回退到云端数据源）。
 * 用一次 GET 探测：GitHub Pages 对不存在的文件返回 404，正好用来判断。
 */
export async function loadStaticIndex(): Promise<JobIndexRow[] | null> {
  if (indexCache) return indexCache
  try {
    const rows = await fetchJson<JobIndexRow[]>('data/index.json')
    if (!Array.isArray(rows) || rows.length === 0) return null
    indexCache = rows
    return rows
  } catch {
    return null
  }
}

async function loadManifest(): Promise<BucketMeta[]> {
  if (manifest) return manifest
  manifest = await fetchJson<BucketMeta[]>('data/buckets.json')
  return manifest
}

/** 找出 id 落在哪个分片，只加载那一片（每片约 100KB，比一次拉全量省得多）。 */
async function findBucket(id: number): Promise<Job | null> {
  const list = await loadManifest()
  const meta = list.find((m) => id >= m.from && id <= m.to)
  if (!meta) return null

  let bucket = bucketCache.get(meta.file)
  if (!bucket) {
    bucket = await fetchJson<Job[]>(`data/${meta.file}`)
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
      try {
        bucket = await fetchJson<Job[]>(`data/${meta.file}`)
      } catch {
        continue
      }
      bucketCache.set(meta.file, bucket)
    }
    for (const j of bucket) if (wanted.has(j.id)) rows.push(j)
  }
  return rows
}

export async function loadStaticJob(id: number): Promise<Job | null> {
  return findBucket(id)
}
