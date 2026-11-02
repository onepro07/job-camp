/**
 * 用新抓的“优质岗位”整体替换 beisen 数据。
 *
 * 步骤：补齐 companies → 删掉旧的 beisen 岗位 → 批量写入新岗位 →
 *       清掉已经没有岗位的企业（避免筛选里出现空企业）。
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'
const H = { 'x-wb-webapp-access-key': KEY, 'Content-Type': 'application/json' }
const BATCH = 100

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const data = JSON.parse(fs.readFileSync(path.join(here, 'data', 'beisen2.json'), 'utf8'))

const META = {
  中国人寿: ['北京', 'https://www.e-chinalife.com', '大型寿险集团，业务覆盖寿险、健康险、养老与资产管理。'],
  中国人保: ['北京', 'https://www.picc.com', '综合性保险金融集团，财险、寿险、健康险与再保险并行。'],
  奇瑞汽车: ['芜湖', 'https://www.chery.cn', '自主品牌整车企业，覆盖乘用车、商用车与新能源。'],
  京东方: ['北京', 'https://www.boe.com', '全球领先的物联网创新企业，半导体显示与传感器件龙头。'],
  新东方: ['北京', 'https://www.xdf.cn', '教育培训机构，业务涵盖出国考试、K12、留学咨询与图书。'],
  零跑汽车: ['杭州', 'https://www.leapmotor.com', '新能源整车企业，主打全域自研与成本控制。'],
  中金公司: ['北京', 'https://www.cicc.com', '投资银行与综合金融服务机构，覆盖投行、股票、固收与研究。'],
  长安汽车: ['重庆', 'https://www.changan.com.cn', '大型汽车集团，自主与合资并行，新能源转型加速。'],
  正大天晴: ['南京', 'https://www.cttq.com', '国内大型制药企业，聚焦肝病、肿瘤、呼吸等治疗领域。'],
  药明康德: ['上海', 'https://www.wuxiapptec.com', '医药研发服务平台，覆盖化学、生物、检测与临床前研究。'],
  希尔顿: ['上海', 'https://www.hilton.com.cn', '国际酒店集团，覆盖奢华、全服务与专注式服务品牌。'],
  中国外运: ['北京', 'https://www.sinotrans.com', '综合物流服务商，覆盖海运、空运、仓储与供应链。'],
  康缘药业: ['连云港', 'https://www.kanion.com', '中药创新药企业，主打妇科、抗感染、心脑血管领域。'],
  大华股份: ['杭州', 'https://www.dahuatech.com', '以视频为核心的智慧物联解决方案与运营服务商。'],
  象屿集团: ['厦门', 'https://www.xiangyu-group.com', '供应链管理与大宗商品贸易集团，兼营港口航运。'],
  深圳先进技术研究院: ['深圳', 'https://www.siat.ac.cn', '中科院系统科研机构，方向覆盖生物医药、脑科学、材料与计算。'],
  国轩高科: ['合肥', 'https://www.gotion.com.cn', '动力与储能电池企业，覆盖材料、电芯与系统集成。'],
  蒙牛: ['呼和浩特', 'https://www.mengniu.com.cn', '乳制品企业，业务覆盖常温奶、低温奶、奶粉与冰淇淋。'],
  以岭药业: ['石家庄', 'https://www.yiling.cn', '中药创新药企业，以络病理论指导新药研发与生产。'],
  江铃汽车: ['南昌', 'https://www.jmc.com.cn', '商用车与乘用车制造企业，轻卡、皮卡、轻客主要厂商。'],
  上海医药: ['上海', 'https://www.sphchina.com', '医药工商业一体化企业，覆盖研发、制造、分销与零售。'],
  光大证券: ['上海', 'https://www.ebscn.com', '综合类券商，覆盖经纪、投行、资管与研究。'],
  北京银行: ['北京', 'https://www.bankofbeijing.com.cn', '城市商业银行，网点覆盖京津沪及多个中心城市。'],
  万豪国际: ['上海', 'https://www.marriott.com.cn', '全球酒店集团，在大中华区运营数十个酒店品牌。'],
  复星医药: ['上海', 'https://www.fosunpharma.com', '医药健康产业集团，覆盖制药、器械、诊断与医疗服务。'],
  麒麟软件: ['天津', 'https://www.kylinos.cn', '国产操作系统厂商，银河麒麟与中标麒麟系列。'],
  欣旺达: ['深圳', 'https://www.sunwoda.com', '锂离子电池模组与储能系统制造商，覆盖消费、动力与储能。'],
  双汇: ['漯河', 'https://www.shuanghui.net', '肉类加工企业，覆盖屠宰、肉制品与冷链物流。'],
  青岛啤酒: ['青岛', 'https://www.tsingtao.com.cn', '啤酒制造企业，品牌覆盖国内外多个市场。'],
  联影医疗: ['上海', 'https://www.united-imaging.com', '高端医学影像设备与放疗设备制造商，覆盖 CT、MR、PET 等产品线。'],
  迈瑞医疗: ['深圳', 'https://www.mindray.com', '医疗设备企业，覆盖生命信息与支持、体外诊断与医学影像。'],
  中核集团: ['北京', 'https://www.cnnc.com.cn', '核工业央企，业务覆盖核电、核燃料循环、核技术应用与工程建设。'],
  名创优品: ['广州', 'https://www.miniso.com', '生活好物零售连锁品牌，全球门店数超过数千家。'],
}

async function getCompanies() {
  const r = await fetch(`${EP}/.cloud/database/rest/v1/companies?select=id,name&limit=300`, { headers: H })
  const rows = await r.json()
  const m = new Map()
  if (Array.isArray(rows)) for (const x of rows) m.set(x.name, x.id)
  return m
}

const ids = await getCompanies()
console.log('已有企业：', ids.size)

const names = [...new Set(data.jobs.map((j) => j.company))]
const missing = names.filter((n) => !ids.has(n))
if (missing.length) {
  const body = missing.map((n) => {
    const meta = META[n]
    return {
      name: n,
      industry: data.companies.find((c) => c.name === n)?.industry ?? null,
      city: meta ? meta[0] : null,
      website: meta ? meta[1] : null,
      intro: meta ? meta[2] : null,
    }
  })
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
  console.log('补充企业：', missing.length)
}

// 清掉旧的多企业岗位（只动 beisen 来源，腾讯的不碰）
const del = await fetch(`${EP}/.cloud/database/rest/v1/jobs?source=eq.beisen`, {
  method: 'DELETE',
  headers: { ...H, Prefer: 'return=minimal' },
})
console.log('删除旧岗位 ->', del.status)
if (!del.ok) {
  console.log((await del.text()).slice(0, 300))
  process.exit(1)
}

const rows = data.jobs.map((j) => ({
  company_id: ids.get(j.company),
  title: j.title.slice(0, 100),
  city: j.city,
  experience: j.years || '不限',
  tags: [j.industry, j.func],
  description: (j.duty || '').replace(/\s+/g, ' ').trim().slice(0, 200) || null,
  source: 'beisen',
  source_id: j.source_id,
  source_url: j.url,
  published_at: j.published_at,
})).filter((r) => r.company_id)

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
  await new Promise((s) => setTimeout(s, 200))
}

// 注意：不要在这里清理“没有岗位的企业”。
// 单次查询最多返回 1000 行，用 jobs 反查“谁还有岗位”会漏掉排在 1000 行之后的企业，
// 而这些企业一旦被删，岗位会被外键级联删除（踩过一次）。空企业不影响筛选，留着即可。

const c = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=id`, {
  headers: { ...H, Prefer: 'count=exact', Range: '0-0' },
})
console.log('库内岗位合计：', (c.headers.get('content-range') || '?').split('/')[1])
