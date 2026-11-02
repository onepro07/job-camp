const CDP = 'http://127.0.0.1:9224'
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
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.navigate', { url: 'http://127.0.0.1:5199/?job=4276' })
  await sleep(7000)

  const r = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      title: document.title,
      cols: getComputedStyle(document.querySelector('.jd-wrap')).gridTemplateColumns,
      cardW: Math.round(document.querySelector('.jd-card').getBoundingClientRect().width),
      sideW: Math.round(document.querySelector('.jd-side-card')?.getBoundingClientRect().width ?? 0),
      topbar: !!document.querySelector('.jd-page .topbar'),
      h2: document.querySelector('.jd-card h2')?.innerText,
    })`,
  })
  console.log('版式检查：', r.result.value)

  const shot = await s.send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('detail-v2.png', Buffer.from(shot.data, 'base64'))
  console.log('已保存 detail-v2.png')
  process.exit(0)
}
main().catch((e) => { console.error('失败：', e.message); process.exit(1) })
