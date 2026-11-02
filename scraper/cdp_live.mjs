const CDP = 'http://127.0.0.1:9223'
const BASE = 'https://job-camp.app.workbuddy.host/?sharecode=JTYTHEKNRU'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Sess {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map() }
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
      }
    }
    return s
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.waiters.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
}

const main = async () => {
  const list = await (await fetch(`${CDP}/json/list`)).json()
  const page = list.find((t) => t.type === 'page')
  const s = await Sess.open(page.webSocketDebuggerUrl)
  await s.send('Page.enable')
  await s.send('Runtime.enable')
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 950, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.navigate', { url: BASE })
  await sleep(9000)

  const info = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const a = document.querySelector('.card-hit');
      if (!a) return { err: 'no card-hit', body: document.body.innerText.slice(0, 120) };
      a.scrollIntoView({ block: 'center' });
      const r = a.getBoundingClientRect();
      return { x: Math.round(r.left + 60), y: Math.round(r.top + 24), href: a.href, title: document.querySelector('.card h3')?.innerText };
    })()`,
  })
  console.log('线上点击目标：', info.result.value)
  if (info.result.value.err) process.exit(1)
  const { x, y } = info.result.value

  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 })
  await s.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 })
  await sleep(6000)

  const after = await (await fetch(`${CDP}/json/list`)).json()
  const pages = after.filter((t) => t.type === 'page' && t.url.includes('job-camp'))
  console.log('job-camp 页面：')
  for (const t of pages) console.log('  ', t.url)
  console.log('新窗口数：', pages.filter((t) => /[?&]job=\d+/.test(t.url)).length)
  process.exit(0)
}
main().catch((e) => { console.error('失败：', e.message); process.exit(1) })
