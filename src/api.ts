import { cloud } from './cloud'
import type { Job, Application } from './types'

const JOB_SELECT = '*, company:companies(id,name,industry,company_size,city,website,intro)'

export interface JobFilters {
  keyword?: string
  city?: string
  experience?: string
  category?: string
  source?: string
  /** 行业（tags[1] 之后的第一位，见 getFacets） */
  industry?: string
  /** 企业名 */
  company?: string
  /** 只看最近 N 天发布的岗位 */
  days?: number
  page?: number
  pageSize?: number
}

export interface JobPage {
  rows: Job[]
  total: number
}

/**
 * 轻量索引：只取筛选项和排序需要的列（1000 条约 100KB），一次取回常驻内存。
 *
 * 为什么不能直接用数据库的 count：云网关没有把 Content-Range 暴露给浏览器
 * （响应头里读不到），所以在浏览器侧拿不到精确总数；而正文（description 等）
 * 才是体积大头，这部分改成按当前页回服务端取。
 */
type JobIndexRow = {
  id: number
  title: string
  city: string | null
  experience: string | null
  tags: string[] | null
  published_at: string | null
  company: { name: string } | null
}

let indexTask: Promise<JobIndexRow[]> | null = null

/**
 * 服务端单次最多返回 1000 行（网关有上限），所以索引要分页拉全，再按“企业轮转”重排：
 * 同一家企业的岗位不会挤在一起，第一页就能看到二三十家不同公司。
 */
function loadIndex(): Promise<JobIndexRow[]> {
  if (!indexTask) {
    indexTask = (async () => {
      const all: JobIndexRow[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await cloud.database
          .from('jobs')
          .select('id,title,city,experience,tags,published_at,company:companies(name)')
          .eq('status', 'active')
          .order('published_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, from + 999)
        if (error) {
          indexTask = null
          throw error
        }
        const batch = (data ?? []) as unknown as JobIndexRow[]
        all.push(...batch)
        if (batch.length < 1000) break
      }
      return interleave(all)
    })()
  }
  return indexTask
}

/** 按企业轮转排序：每轮从每家公司取一条，企业内部保持“新→旧”。 */
function interleave(rows: JobIndexRow[]): JobIndexRow[] {
  const groups = new Map<string, JobIndexRow[]>()
  for (const r of rows) {
    const k = r.company?.name ?? '未知企业'
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  // 企业顺序：各自最新岗位越新越靠前
  const order = [...groups.keys()].sort((a, b) => {
    const pa = groups.get(a)?.[0]?.published_at ?? ''
    const pb = groups.get(b)?.[0]?.published_at ?? ''
    return pb.localeCompare(pa)
  })
  const out: JobIndexRow[] = []
  let added = true
  while (added) {
    added = false
    for (const k of order) {
      const g = groups.get(k)
      if (g && g.length) {
        out.push(g.shift() as JobIndexRow)
        added = true
      }
    }
  }
  return out
}

function sinceDate(days?: number): string | null {
  if (!days || days <= 0) return null
  const d = new Date()
  d.setDate(d.getDate() - days + 1)
  return d.toISOString().slice(0, 10)
}

function hitTest(r: JobIndexRow, f: JobFilters, since: string | null): boolean {
  const kw = f.keyword?.trim().toLowerCase()
  if (kw && !r.title.toLowerCase().includes(kw)) return false
  if (f.city && r.city !== f.city) return false
  if (f.experience && r.experience !== f.experience) return false
  if (f.industry && (r.tags ?? [])[0] !== f.industry) return false
  if (f.category && !(r.tags ?? []).includes(f.category)) return false
  if (f.company && r.company?.name !== f.company) return false
  if (since && (r.published_at ?? '').slice(0, 10) < since) return false
  return true
}

/**
 * 服务端分页：索引负责筛选和算总数，当前页的完整内容（职责原文等）回服务端按 id 取。
 * 一次请求只拿 12 条正文，不再把上千条 description 一起塞给浏览器。
 */
export async function listJobs(f: JobFilters = {}): Promise<JobPage> {
  const idx = await loadIndex()
  const since = sinceDate(f.days)
  const hit = idx.filter((r) => hitTest(r, f, since))

  const page = f.page ?? 0
  const pageSize = f.pageSize ?? 12
  const slice = hit.slice(page * pageSize, page * pageSize + pageSize)
  if (slice.length === 0) return { rows: [], total: hit.length }

  const ids = slice.map((r) => r.id)
  const { data, error } = await cloud.database
    .from('jobs')
    .select(JOB_SELECT)
    .in('id', ids)
  if (error) throw error

  const byId = new Map<number, Job>()
  for (const row of (data ?? []) as unknown as Job[]) byId.set(row.id, row)
  const rows = ids.map((id) => byId.get(id)).filter((r): r is Job => Boolean(r))
  return { rows, total: hit.length }
}

export async function getJob(id: number): Promise<Job | null> {
  const { data, error } = await cloud.database
    .from('jobs')
    .select(JOB_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as Job) ?? null
}

/** 筛选项计数：直接复用上面那份索引，不再额外请求。 */
export async function getFacets(): Promise<{
  cities: [string, number][]
  experiences: [string, number][]
  categories: [string, number][]
  industries: [string, number][]
  companies: [string, number][]
  /** 岗位总数（用于「全部 xx」那一行，避免和筛选后的数字混淆） */
  total: number
}> {
  const all = await loadIndex()

  const city = new Map<string, number>()
  const exp = new Map<string, number>()
  const cat = new Map<string, number>()
  const grp = new Map<string, number>()
  const comp = new Map<string, number>()

  for (const r of all) {
    const nm = r.company?.name
    if (nm) comp.set(nm, (comp.get(nm) ?? 0) + 1)
    if (r.city) city.set(r.city, (city.get(r.city) ?? 0) + 1)
    if (r.experience) exp.set(r.experience, (exp.get(r.experience) ?? 0) + 1)
    const tags = r.tags ?? []
    if (tags[0]) grp.set(tags[0], (grp.get(tags[0]) ?? 0) + 1)
    if (tags[1]) cat.set(tags[1], (cat.get(tags[1]) ?? 0) + 1)
  }

  const sort = (m: Map<string, number>, n = 12) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  return {
    cities: sort(city, 18),
    experiences: sort(exp, 12),
    categories: sort(cat, 14),
    industries: sort(grp, 16),
    companies: sort(comp, 40),
    total: all.length,
  }
}

/* ---------- 收藏 ---------- */

export async function listFavoriteIds(): Promise<number[]> {
  const { data, error } = await cloud.database.from('favorites').select('job_id')
  if (error) return []
  return ((data ?? []) as { job_id: number }[]).map((r) => r.job_id)
}

export async function addFavorite(jobId: number): Promise<void> {
  const { error } = await cloud.database.from('favorites').insert({ job_id: jobId })
  if (error && error.code !== '23505') throw error
}

export async function removeFavorite(jobId: number): Promise<void> {
  const { error } = await cloud.database.from('favorites').delete().eq('job_id', jobId)
  if (error) throw error
}

/* ---------- 投递 ---------- */

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await cloud.database
    .from('applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Application[]
}

export async function createApplication(input: {
  job_id: number
  job_title: string
  company_name: string | null
  job_city: string | null
}): Promise<void> {
  const { error } = await cloud.database.from('applications').insert({
    job_id: input.job_id,
    job_title: input.job_title,
    company_name: input.company_name,
    job_city: input.job_city,
    status: 'applied',
  })
  if (error) throw error
}

export async function updateApplicationStatus(id: number, status: string): Promise<void> {
  const { data, error } = await cloud.database
    .from('applications')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
  if (error) throw error
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('没有更新成功，可能记录不存在或不属于你')
  }
}
