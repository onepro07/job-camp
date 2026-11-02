// 验证 Cloudflare Pages 线上站点：静态数据、筛选、详情新标签、?data=cloud 实时链路、手机视口
const CDP = 'http://127.0.0.1:9228'
const BASE = process.env.TARGET || 'https://job-camp.pages.dev/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function session(url, mobile) {
  const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
  await sleep(600)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const failed = []
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  ws.onmessage = (e) => {
    const x = JSON.parse(e.data)
    if (x.id && pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id) }
    if (x.method === 'Network.loadingFailed' && x.params.errorText !== 'net::ERR_ABORTED') failed.push(x.params.errorText)
  }
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  await send('Page.navigate', { url })
  await sleep(16000)
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 150)
    return r.result?.value
  }
  return { send, ev, failed, close: () => ws.close() }
}

async function main() {
  console.log('=== 桌面：静态数据 ===')
  const a = await session(BASE, false)
  console.log('标题:', await a.ev('document.title'))
  console.log('岗位总数:', await a.ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/)||[])[1]'))
  console.log('卡片:', await a.ev('document.querySelectorAll(".card").length'))
  console.log('本机收藏标识:', await a.ev('document.querySelector(".local-badge")?.textContent.trim() ?? "(无)"'))
  console.log('数据文件请求:', await a.ev('performance.getEntriesByType("resource").filter(r=>r.name.includes("/data/")).length'))
  console.log('失败请求:', a.failed.length ? a.failed.slice(0, 3).join(' | ') : '无')

  // 搜索
  await a.ev(`(() => {
    const inp = document.querySelector('input[aria-label*="关键词"], .searchbar input');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    set.call(inp, '工程师'); inp.dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('button')].find(b=>b.textContent.includes('搜索')).click();
  })()`)
  await sleep(3000)
  console.log('搜索「工程师」:', await a.ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/)||[])[1]'), '条')

  // 点卡片开详情
  await a.ev(`[...document.querySelectorAll('button')].find(b=>/清空筛选/.test(b.textContent))?.click()`)
  await sleep(2500)
  const box = await a.ev(`(() => {
    const el = document.querySelector('.card-hit'); if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + 30) };
  })()`)
  if (box) {
    await sleep(400)
    await a.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(90)
    await a.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(6000)
  }
  const tabs = await (await fetch(`${CDP}/json/list`)).json()
  const detail = tabs.find((x) => x.type === 'page' && x.url.includes('job='))
  console.log('新标签:', detail ? detail.url : '未打开')
  if (detail) {
    const ws2 = new WebSocket(detail.webSocketDebuggerUrl)
    let i2 = 0; const p2 = new Map()
    const s2 = (m, p = {}) => new Promise((res) => { const i = ++i2; p2.set(i, res); ws2.send(JSON.stringify({ id: i, method: m, params: p })) })
    ws2.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && p2.has(x.id)) { p2.get(x.id)(x.result); p2.delete(x.id) } }
    await new Promise((r) => (ws2.onopen = r))
    await s2('Runtime.enable'); await sleep(5000)
    const e2 = async (x) => (await s2('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value
    console.log('  详情标题:', await e2('document.title'))
    console.log('  meta 行:', await e2('document.querySelectorAll(".jd-meta > div").length'), '| 遮罩:', await e2('document.querySelector(".jd-mask")?"有(异常)":"无"'))
    ws2.close()
  }
  const s1 = await a.send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('cf-list.png', Buffer.from(s1.data, 'base64'))
  a.close()

  console.log('\n=== 手机视口 ===')
  const m = await session(BASE, true)
  console.log('总数:', await m.ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/)||[])[1]'))
  console.log('横向溢出:', await m.ev('document.documentElement.scrollWidth - document.documentElement.clientWidth'))
  const s2 = await m.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync('cf-mobile.png', Buffer.from(s2.data, 'base64'))
  m.close()

  console.log('\n=== 实时链路 ?data=cloud ===')
  const c = await session(BASE + '?data=cloud', false)
  console.log('总数:', await c.ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/)||[])[1]'))
  console.log('卡片:', await c.ev('document.querySelectorAll(".card").length'))
  console.log('本机收藏标识:', await c.ev('document.querySelector(".local-badge")?.textContent.trim() ?? "(无，说明是云端模式)"'))
  console.log('/api 请求数:', await c.ev('performance.getEntriesByType("resource").filter(r=>r.name.includes("/api/")).length'))
  console.log('失败请求:', c.failed.length ? c.failed.slice(0, 3).join(' | ') : '无')
  c.close()
  console.log('\n截图: cf-list.png / cf-mobile.png')
}

main().catch((e) => console.error('ERR', e))
