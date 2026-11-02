const CDP = 'http://127.0.0.1:9224'
const PAGE = 'file:///C:/Users/HP/Desktop/_frame.html'
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
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.navigate', { url: PAGE })
  await sleep(3000)

  const meta = await s.send('Runtime.evaluate', {
    awaitPromise: true, returnByValue: true,
    expression: `window.__ready`,
  })
  console.log('视频信息：', meta.result.value)

  const dur = meta.result.value?.d ?? 0
  const fs = await import('node:fs')
  const times = []
  for (let t = 0.4; t < Math.min(dur, 40); t += 2.2) times.push(Number(t.toFixed(2)))
  console.log('抽帧时间点：', times.join(', '))

  for (const t of times) {
    await s.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `window.__seek(${t})` })
    await sleep(500)
    const shot = await s.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(`frame-${String(t).replace('.', '_')}.png`, Buffer.from(shot.data, 'base64'))
  }
  console.log('完成，共', times.length, '帧')
  process.exit(0)
}
main().catch((e) => { console.error('失败：', e.message); process.exit(1) })
