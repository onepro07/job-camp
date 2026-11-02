// 验证 GitHub Pages 线上站点：数据是否加载、筛选是否可用、详情是否新标签打开
const CDP = 'http://127.0.0.1:9226'
const URL_LIVE = 'https://onepro07.github.io/job-camp/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
  await sleep(600)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  const failed = []
  ws.onmessage = (e) => {
    const x = JSON.parse(e.data)
    if (x.id && pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id) }
    if (x.method === 'Network.loadingFailed') failed.push(x.params)
  }
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Network.enable')

  await send('Page.navigate', { url: URL_LIVE })
  await sleep(10000)

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 150)
    return r.result?.value
  }
  const total = () => ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/) || [])[1]')

  console.log('页面标题:', await ev('document.title'))
  console.log('岗位总数:', await total())
  console.log('卡片数:', await ev('document.querySelectorAll(".card").length'))
  console.log('顶栏标识:', await ev('document.querySelector(".local-badge")?.textContent.trim() ?? "(无)"'))
  console.log('首卡标题:', await ev('document.querySelector(".card h3")?.textContent'))
  console.log('数据请求成功数:', await ev('performance.getEntriesByType("resource").filter(r=>r.name.includes("/data/")).length'))
  console.log('失败请求:', failed.length === 0 ? '无' : failed.map(f => f.errorText).slice(0, 3).join(','))

  // 点第一张卡 → 应新开标签
  await ev('document.querySelector(".card-hit")?.click()')
  await sleep(5000)
  const tabs = await (await fetch(`${CDP}/json/list`)).json()
  const detail = tabs.find((x) => x.type === 'page' && x.url.includes('job='))
  if (!detail) {
    console.log('详情: 未新开标签')
  } else {
    console.log('详情 URL:', detail.url)
    const ws2 = new WebSocket(detail.webSocketDebuggerUrl)
    let i2 = 0; const p2 = new Map()
    const s2 = (m, p = {}) => new Promise((res) => { const i = ++i2; p2.set(i, res); ws2.send(JSON.stringify({ id: i, method: m, params: p })) })
    ws2.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && p2.has(x.id)) { p2.get(x.id)(x.result); p2.delete(x.id) } }
    await new Promise((r) => (ws2.onopen = r))
    await s2('Runtime.enable')
    await sleep(4000)
    const e2 = async (x) => (await s2('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value
    console.log('详情标题:', await e2('document.title'))
    console.log('详情 meta 行:', await e2('document.querySelectorAll(".jd-meta > div").length'))
    console.log('职责条目:', await e2('document.querySelectorAll(".jd-list")[0]?.children.length ?? 0'))
    console.log('投递侧栏:', await e2('!!document.querySelector(".jd-side-card")'))
    console.log('遮罩层:', await e2('document.querySelector(".jd-mask") ? "存在(异常)" : "无"'))
    const shot2 = await s2('Page.captureScreenshot', { format: 'png' })
    const fs = await import('node:fs')
    fs.writeFileSync('live-detail.png', Buffer.from(shot2.data, 'base64'))
    ws2.close()
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('live-list.png', Buffer.from(shot.data, 'base64'))
  console.log('截图: live-list.png / live-detail.png')
  ws.close()
}

main().catch((e) => console.error('ERR', e))
