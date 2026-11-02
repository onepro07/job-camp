const CDP = 'http://127.0.0.1:9222'
const BASE = 'http://127.0.0.1:5178/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Sess {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.events = [] }
  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const s = new Sess(ws)
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id && s.waiters.has(m.id)) {
        const { res, rej } = s.waiters.get(m.id)
        s.waiters.delete(m.id)
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
      } else if (m.method) s.events.push(m)
    }
    return s
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.waiters.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }
}

const main = async () => {
  const list = await (await fetch(`${CDP}/json/list`)).json()
  const page = list.find((t) => t.type === 'page' && t.url.includes('5178'))
    || list.find((t) => t.type === 'page')
  const s = await Sess.open(page.webSocketDebuggerUrl)
  await s.send('Page.enable')
  await s.send('Runtime.enable')
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.navigate', { url: BASE })
  await sleep(6500)

  const info = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const a = document.querySelector('.card-hit');
      if (!a) return { err: 'no card-hit' };
      a.scrollIntoView({block:'center'});
      const r = a.getBoundingClientRect();
      const x = Math.round(r.left + 60), y = Math.round(r.top + 24);
      const el = document.elementFromPoint(x, y);
      return { x, y, href: a.getAttribute('href'), hit: el && (el.tagName + '.' + el.className),
               vw: innerWidth, vh: innerHeight };
    })()`,
  })
  console.log('点击前：', info.result.value)
  const { x, y } = info.result.value

  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(3000)

  const after = await (await fetch(`${CDP}/json/list`)).json()
  console.log('点击后所有 page：')
  for (const t of after.filter((t) => t.type === 'page')) console.log('  ', t.url.slice(0, 110))

  const still = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({ url: location.href, cards: document.querySelectorAll('.card').length })`,
  })
  console.log('原窗口：', still.result.value)

  const detail = after.find((t) => t.type === 'page' && t.url.includes('job='))
  if (!detail) { console.log('没有新窗口'); process.exit(1) }

  const d = await Sess.open(detail.webSocketDebuggerUrl)
  await d.send('Page.enable')
  await d.send('Emulation.setDeviceMetricsOverride', { width: 920, height: 1040, deviceScaleFactor: 1, mobile: false })
  await sleep(3000)
  const shot = await d.send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('detail-window.png', Buffer.from(shot.data, 'base64'))
  console.log('新窗口已打开并截图 detail-window.png')
  process.exit(0)
}

main().catch((e) => { console.error('失败：', e.message); process.exit(1) })
