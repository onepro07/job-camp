const CDP = 'http://127.0.0.1:9223'
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
  const target = list.find((t) => t.type === 'page' && /[?&]job=\d+/.test(t.url))
  if (!target) throw new Error('没有详情窗口')
  const s = await Sess.open(target.webSocketDebuggerUrl)
  await s.send('Page.enable')
  await s.send('Runtime.enable')
  await s.send('Emulation.setDeviceMetricsOverride', { width: 920, height: 1040, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.reload')
  await sleep(7000)

  const r = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({
      url: location.href,
      title: document.title,
      h2: document.querySelector('.jd-card h2')?.innerText ?? null,
      metaCount: document.querySelectorAll('.jd-meta > div').length,
      listItems: document.querySelectorAll('.jd-list li').length,
      overlay: !!document.querySelector('.jd-mask'),
      bodyStart: document.body.innerText.slice(0, 60),
    })`,
  })
  console.log('详情窗口：', r.result.value)

  const shot = await s.send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('live-detail.png', Buffer.from(shot.data, 'base64'))
  console.log('已截图 live-detail.png')
  process.exit(0)
}
main().catch((e) => { console.error('失败：', e.message); process.exit(1) })
