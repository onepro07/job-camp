/**
 * 导入北森招聘门户抓到的 500 条岗位（12 家企业、6 个行业）。
 *
 * 与 import_jobs.mjs 同样走云服务的 PostgREST 接口，数据不经过人工中转。
 * 先补齐 companies（按 name 去重），再按 company_id 写 jobs。
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'
const H = { 'x-wb-webapp-access-key': KEY, 'Content-Type': 'application/json' }
const BATCH = 100

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const data = JSON.parse(fs.readFileSync(path.join(here, 'data', 'beisen.json'), 'utf8'))

const META = {
  京东方: { city: '北京', industry: '电子制造', website: 'https://www.boe.com', intro: '全球领先的物联网创新企业，半导体显示与传感器件龙头。' },
  正大天晴: { city: '南京', industry: '医药生物', website: 'https://www.cttq.com', intro: '国内大型制药企业，聚焦肝病、肿瘤、呼吸等治疗领域。' },
  中国外运: { city: '北京', industry: '物流运输', website: 'https://www.sinotrans.com', intro: '招商局集团旗下综合物流服务商，覆盖海运、空运、仓储与供应链。' },
  希尔顿: { city: '上海', industry: '酒店服务', website: 'https://www.hilton.com.cn', intro: '国际酒店集团，旗下覆盖奢华、全服务与专注式服务等多个品牌。' },
  江铃汽车: { city: '南昌', industry: '汽车制造', website: 'https://www.jmc.com.cn', intro: '商用车与乘用车制造企业，轻卡、皮卡、轻客领域主要厂商之一。' },
  康缘药业: { city: '连云港', industry: '医药生物', website: 'https://www.kanion.com', intro: '中药创新药企业，主打妇科、抗感染、心脑血管等领域。' },
  万豪国际: { city: '上海', industry: '酒店服务', website: 'https://www.marriott.com.cn', intro: '全球酒店集团，在大中华区运营数十个酒店品牌。' },
  大华股份: { city: '杭州', industry: '电子制造', website: 'https://www.dahuatech.com', intro: '以视频为核心的智慧物联解决方案与运营服务商。' },
  以岭药业: { city: '石家庄', industry: '医药生物', website: 'https://www.yiling.cn', intro: '中药创新药企业，络病理论指导下的新药研发与生产。' },
  欣旺达: { city: '深圳', industry: '电子制造', website: 'https://www.sunwoda.com', intro: '锂离子电池模组与储能系统制造商，覆盖消费、动力与储能。' },
  上海医药: { city: '上海', industry: '医药生物', website: 'https://www.sphchina.com', intro: '医药工商业一体化企业，覆盖研发、制造、分销与零售。' },
  星巴克: { city: '上海', industry: '餐饮零售', website: 'https://www.starbucks.com.cn', intro: '全球连锁咖啡品牌，中国门店覆盖数百个城市。' },
}

async function existingCompanies() {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/companies?select=id,name&limit=200`, { headers: H })
  const rows = await r.json()
  const m = new Map()
  if (Array.isArray(rows)) for (const x of rows) m.set(x.name, x.id)
  return m
}

const ids = await existingCompanies()
console.log('已有企业：', ids.size)

const names = [...new Set(data.jobs.map((j) => j.company))]
const missing = names.filter((n) => !ids.has(n))
if (missing.length) {
  const body = missing.map((n) => ({
    name: n,
    industry: META[n]?.industry ?? null,
    city: META[n]?.city ?? null,
    website: META[n]?.website ?? null,
    intro: META[n]?.intro ?? null,
    company_size: null,
  }))
  const r = await fetch(`${EP}/.cloud/database/rest/v1/companies`, {
    method: 'POST',
    headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    console.log('企业写入失败', r.status, (await r.text()).slice(0, 300))
    process.exit(1)
  }
  for (const c of await r.json()) ids.set(c.name, c.id)
  console.log('新增企业：', missing.length)
}

const rows = data.jobs.map((j) => ({
  company_id: ids.get(j.company),
  title: j.title.slice(0, 90),
  city: j.city,
  experience: j.years || '不限',
  tags: [j.industry, j.func],
  description: (j.duty || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null,
  source: 'beisen',
  source_id: j.source_id,
  source_url: j.url,
  published_at: j.published_at,
}))

console.log('待写入岗位：', rows.length)
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

const c = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=id`, {
  headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
})
console.log('库内岗位合计：', (c.headers.get('content-range') || '?').split('/')[1])
