/**
 * 把 beisen3.json 增量写入云数据库（不清空旧数据）。
 *
 * 与 v2 的关键差别：
 * 1. 不再 DELETE 全部 beisen 岗位，改按 (source, source_id) upsert —— 上次清空时
 *    踩过「反查空企业被 1000 行上限骗过，级联删掉岗位」的坑，增量写入最安全
 * 2. 直接写入 requirements（列表接口自带 Require 字段），不需要再跑 enrich
 * 3. description 保留完整职责文本（旧版截断到 200 字）
 *
 * 用法：node scraper/beisen_import3.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const EP = 'https://job-camp.app.workbuddy.host'
const KEY = 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'
const H = { 'x-wb-webapp-access-key': KEY, 'Content-Type': 'application/json' }
const BATCH = 100

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const data = JSON.parse(fs.readFileSync(path.join(here, 'data', 'beisen3.json'), 'utf8'))

// 企业元数据：城市 / 官网 / 一句话简介
const META = {
  奇瑞汽车: ['芜湖', 'https://www.chery.cn', '自主品牌整车企业，覆盖乘用车、商用车与新能源。'],
  中核集团: ['北京', 'https://www.cnnc.com.cn', '核工业央企，业务覆盖核电、核燃料循环、核技术应用与工程建设。'],
  中国人寿: ['北京', 'https://www.e-chinalife.com', '大型寿险集团，业务覆盖寿险、健康险、养老与资产管理。'],
  京东方: ['北京', 'https://www.boe.com', '全球领先的物联网创新企业，半导体显示与传感器件龙头。'],
  中国人保: ['北京', 'https://www.picc.com', '综合性保险金融集团，财险、寿险、健康险与再保险并行。'],
  新东方: ['北京', 'https://www.xdf.cn', '教育培训机构，业务涵盖出国考试、K12、留学咨询与图书。'],
  零跑汽车: ['杭州', 'https://www.leapmotor.com', '新能源整车企业，主打全域自研与成本控制。'],
  国轩高科: ['合肥', 'https://www.gotion.com.cn', '动力与储能电池企业，覆盖材料、电芯与系统集成。'],
  正大天晴: ['南京', 'https://www.cttq.com', '国内大型制药企业，聚焦肝病、肿瘤、呼吸等治疗领域。'],
  联影医疗: ['上海', 'https://www.united-imaging.com', '高端医学影像设备与放疗设备制造商，覆盖 CT、MR、PET 等产品线。'],
  长江存储: ['武汉', 'https://www.ymtc.com', '3D NAND 闪存设计与制造企业，覆盖消费级与企业级存储。'],
  药明康德: ['上海', 'https://www.wuxiapptec.com', '医药研发服务平台，覆盖化学、生物、检测与临床前研究。'],
  希尔顿: ['上海', 'https://www.hilton.com.cn', '国际酒店集团，覆盖奢华、全服务与专注式服务品牌。'],
  中国外运: ['北京', 'https://www.sinotrans.com', '综合物流服务商，覆盖海运、空运、仓储与供应链。'],
  新华三: ['杭州', 'https://www.h3c.com', '数字化解决方案提供商，覆盖网络、计算、存储与云平台。'],
  万豪国际: ['上海', 'https://www.marriott.com.cn', '全球酒店集团，在大中华区运营数十个酒店品牌。'],
  康缘药业: ['连云港', 'https://www.kanion.com', '中药创新药企业，主打妇科、抗感染、心脑血管领域。'],
  国金证券: ['上海', 'https://www.gjzq.com.cn', '综合类券商，覆盖经纪、投行、资管与研究业务。'],
  中金公司: ['北京', 'https://www.cicc.com', '投资银行与综合金融服务机构，覆盖投行、股票、固收与研究。'],
  长安汽车: ['重庆', 'https://www.changan.com.cn', '大型汽车集团，自主与合资并行，新能源转型加速。'],
  大华股份: ['杭州', 'https://www.dahuatech.com', '以视频为核心的智慧物联解决方案与运营服务商。'],
  以岭药业: ['石家庄', 'https://www.yiling.cn', '中药创新药企业，以络病理论指导新药研发与生产。'],
  上海银行: ['上海', 'https://www.bosc.cn', '城市商业银行，网点覆盖长三角及多个中心城市。'],
  象屿集团: ['厦门', 'https://www.xiangyu-group.com', '供应链管理与大宗商品贸易集团，兼营港口航运。'],
  迈瑞医疗: ['深圳', 'https://www.mindray.com', '医疗设备企业，覆盖生命信息与支持、体外诊断与医学影像。'],
  星巴克: ['上海', 'https://www.starbucks.com.cn', '全球咖啡连锁品牌，大中华区门店覆盖百余城市。'],
  深圳先进技术研究院: ['深圳', 'https://www.siat.ac.cn', '中科院系统科研机构，方向覆盖生物医药、脑科学、材料与计算。'],
  江铃汽车: ['南昌', 'https://www.jmc.com.cn', '商用车与乘用车制造企业，轻卡、皮卡、轻客主要厂商。'],
  上海医药: ['上海', 'https://www.sphchina.com', '医药工商业一体化企业，覆盖研发、制造、分销与零售。'],
  蒙牛: ['呼和浩特', 'https://www.mengniu.com.cn', '乳制品企业，业务覆盖常温奶、低温奶、奶粉与冰淇淋。'],
  复星医药: ['上海', 'https://www.fosunpharma.com', '医药健康产业集团，覆盖制药、器械、诊断与医疗服务。'],
  三一重工: ['长沙', 'https://www.sanygroup.com', '工程机械制造商，覆盖混凝土、挖掘、起重与桩工机械。'],
  欣旺达: ['深圳', 'https://www.sunwoda.com', '锂离子电池模组与储能系统制造商，覆盖消费、动力与储能。'],
  双汇: ['漯河', 'https://www.shuanghui.net', '肉类加工企业，覆盖屠宰、肉制品与冷链物流。'],
  光大证券: ['上海', 'https://www.ebscn.com', '综合类券商，覆盖经纪、投行、资管与研究。'],
  麒麟软件: ['天津', 'https://www.kylinos.cn', '国产操作系统厂商，银河麒麟与中标麒麟系列。'],
  北京银行: ['北京', 'https://www.bankofbeijing.com.cn', '城市商业银行，网点覆盖京津沪及多个中心城市。'],
  名创优品: ['广州', 'https://www.miniso.com', '生活好物零售连锁品牌，全球门店数数千家。'],
  青岛啤酒: ['青岛', 'https://www.tsingtao.com.cn', '啤酒制造企业，品牌覆盖国内外多个市场。'],
  中国移动研究院: ['北京', 'https://www.chinamobilelabs.cn', '中国移动直属研发机构，方向覆盖 5G/6G、网络智能化与算力。'],
  德邦快递: ['上海', 'https://www.deppon.com', '大件快递与零担物流服务商，覆盖全国运输网络。'],
  通用技术集团: ['北京', 'https://www.genertec.com.cn', '中央企业，业务覆盖机床装备、医药健康、贸易工程与技术服务。'],
  英洛华科技: ['东阳', 'https://www.yingluohua.com', '磁性材料与电机电控制造企业，横店集团旗下上市平台。'],
  星恒电源: ['苏州', 'https://www.xingheng.com.cn', '动力锂电池企业，主打两轮车与轻型车电池。'],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getCompanies() {
  const m = new Map()
  for (let off = 0; off < 2000; off += 1000) {
    const r = await fetch(`${EP}/.cloud/database/rest/v1/companies?select=id,name&limit=1000&offset=${off}`, { headers: H })
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const x of rows) m.set(x.name, x.id)
    if (rows.length < 1000) break
  }
  return m
}

const ids = await getCompanies()
console.log('现有企业：', ids.size)

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
  console.log('新增企业：', missing.join('、'))
} else {
  console.log('企业已全部存在，无需补充')
}

const rows = data.jobs
  .map((j) => {
    // 北森列表接口不返回工作地点（LocNames 恒为空），只能靠标题里的城市名。
    // 标题也没提到的，用企业主城市兜底——否则城市筛选会被「全国/多地」淹没。
    const fromTitle = j.city && j.city !== '全国/多地' ? j.city : null
    const city = fromTitle ?? META[j.company]?.[0] ?? '全国/多地'
    return {
      company_id: ids.get(j.company),
      title: j.title.slice(0, 120),
      city,
      experience: j.years || '不限',
      tags: [j.industry, j.func],
      description: (j.duty || '').replace(/\r/g, '').trim().slice(0, 4000) || null,
      requirements: (j.require || '').replace(/\r/g, '').trim().slice(0, 4000) || null,
      source: 'beisen',
      source_id: j.source_id,
      source_url: j.url,
      published_at: j.published_at,
      status: 'active',
    }
  })
  .filter((r) => r.company_id)

const cityStat = {}
for (const r of rows) cityStat[r.city] = (cityStat[r.city] ?? 0) + 1
console.log('城市分布：', Object.entries(cityStat).sort((a, b) => b[1] - a[1]).slice(0, 10)
  .map(([k, v]) => `${k} ${v}`).join(' / '))

console.log('待写入岗位：', rows.length)

// 优先用 (source, source_id) 做冲突键，让旧记录也能被更新（补全职责/要求）
let conflictMode = 'merge'
let failures = 0

async function post(chunk, mode) {
  const qs = mode === 'merge' ? '?on_conflict=source,source_id' : ''
  const prefer = mode === 'merge'
    ? 'return=minimal,resolution=merge-duplicates'
    : 'return=minimal,resolution=ignore-duplicates'
  const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs${qs}`, {
    method: 'POST',
    headers: { ...H, Prefer: prefer },
    body: JSON.stringify(chunk),
  })
  return { ok: r.ok, status: r.status, text: r.ok ? '' : (await r.text()).slice(0, 200) }
}

let written = 0

/** 网关对大批量偶发 403，递归对半拆分重试，最小到 10 条再放弃 */
async function postBatch(chunk) {
  if (chunk.length === 0) return 0
  let res = await post(chunk, conflictMode)

  // 没有 (source, source_id) 唯一约束时退化为忽略重复
  if (!res.ok && res.status === 400 && conflictMode === 'merge') {
    console.log('  on_conflict 不可用，退化为 ignore-duplicates')
    conflictMode = 'ignore'
    res = await post(chunk, conflictMode)
  }
  if (res.ok) return chunk.length

  if (res.status === 403 && chunk.length > 10) {
    const half = Math.ceil(chunk.length / 2)
    await sleep(400)
    const a = await postBatch(chunk.slice(0, half))
    const b = await postBatch(chunk.slice(half))
    return a + b
  }

  failures++
  console.log(`  批次失败 ${res.status}（${chunk.length} 条）: ${res.text}`)
  return 0
}

for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH)
  written += await postBatch(chunk)
  if ((i / BATCH + 1) % 5 === 0) console.log(`  已处理 ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  await sleep(250)
}

console.log(`\n写入完成：${written} 条成功，${failures} 批彻底失败（模式：${conflictMode}）`)

// 统计库内总量
async function countJobs() {
  let n = 0
  for (let off = 0; off < 20000; off += 1000) {
    const r = await fetch(`${EP}/.cloud/database/rest/v1/jobs?select=id&limit=1000&offset=${off}`, { headers: H })
    const rows = await r.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    n += rows.length
    if (rows.length < 1000) break
  }
  return n
}
console.log('库内岗位合计：', await countJobs())
