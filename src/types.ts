export interface Company {
  id: number
  name: string
  industry: string | null
  company_size: string | null
  city: string | null
  website: string | null
  intro: string | null
}

export interface Job {
  id: number
  company_id: number | null
  title: string
  city: string | null
  district: string | null
  salary_min: number | null
  salary_max: number | null
  salary_months: number | null
  experience: string | null
  education: string | null
  job_type: string | null
  tags: string[] | null
  description: string | null
  requirements: string | null
  created_at: string | null
  source: string
  source_id: string
  source_url: string | null
  published_at: string | null
  status: string
  company?: Company | null
}

export interface Application {
  id: number
  job_id: number | null
  company_name: string | null
  job_title: string
  job_city: string | null
  status: string
  applied_at: string | null
  next_action: string | null
  next_action_at: string | null
  notes: string | null
}

export const SOURCE_LABEL: Record<string, string> = {
  tencent: '腾讯招聘',
  beisen: '企业官网',
  bytedance: '字节招聘',
  sdu: '高校就业网',
}

/** 把 2026-11-02T00:00:00+08:00 之类压成 2026-11-02；一周内显示“N 天前”。 */
export function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
