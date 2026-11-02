// 线上站点的真实交互验证：CDP 发真实鼠标事件点击卡片，确认新标签打开
const CDP = 'http://127.0.0.1:9227'
const URL_LIVE = 'https://onepro07.github.io/job-camp/'
const W = 1400
const H = 900
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
  await sleep(700)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id) } }
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })

  await send('Page.navigate', { url: URL_LIVE })
  await sleep(9000)

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 160)
    return r.result?.value
  }

  console.log('总数:', await ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/)||[])[1]'))
  console.log('卡片:', await ev('document.querySelectorAll(".card").length'))

  // 把第一张卡滚到视口中间，再取坐标
  const box = await ev(`(() => {
    const a = document.querySelector('.card-hit');
    if (!a) return null;
    a.scrollIntoView({ block: 'center' });
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(40, r.height / 2)), w: Math.round(r.width), h: Math.round(r.height) };
  })()`)
  console.log('卡片坐标:', JSON.stringify(box))
  if (!box) { ws.close(); return }

  await sleep(600)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none', clickCount: 0 })
  await sleep(200)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(90)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(6000)

  const tabs = await (await fetch(`${CDP}/json/list`)).json()
  const pages = tabs.filter((x) => x.type === 'page').map((x) => x.url)
  console.log('当前页面:', pages)
  const detail = tabs.find((x) => x.type === 'page' && x.url.includes('job='))

  if (!detail) {
    console.log('结果: 未新开标签')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const fs = await import('node:fs')
    fs.writeFileSync('live-list.png', Buffer.from(shot.data, 'base64'))
    ws.close()
    return
  }

  console.log('新标签:', detail.url)
  const ws2 = new WebSocket(detail.webSocketDebuggerUrl)
  let i2 = 0; const p2 = new Map()
  const s2 = (m, p = {}) => new Promise((res) => { const i = ++i2; p2.set(i, res); ws2.send(JSON.stringify({ id: i, method: m, params: p })) })
  ws2.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && p2.has(x.id)) { p2.get(x.id)(x.result); p2.delete(x.id) } }
  await new Promise((r) => (ws2.onopen = r))
  await s2('Runtime.enable')
  await s2('Page.enable')
  await s2('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await sleep(4000)
  const e2 = async (x) => (await s2('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.value
  console.log('详情标题:', await e2('document.title'))
  console.log('meta 行数:', await e2('document.querySelectorAll(".jd-meta > div").length'))
  console.log('职责条目:', await e2('document.querySelectorAll(".jd-list")[0]?.children.length ?? 0'))
  console.log('侧栏投递按钮:', await e2('[...document.querySelectorAll("a,button")].some(e=>/去原站投递/.test(e.textContent))'))
  console.log('遮罩层:', await e2('document.querySelector(".jd-mask") ? "存在(异常)" : "无"'))
  const shot2 = await s2('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('live-detail.png', Buffer.from(shot2.data, 'base64'))
  ws2.close()
  ws.close()
}

main().catch((e) => console.error('ERR', e))
