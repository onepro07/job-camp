const CDP = 'http://127.0.0.1:9222'
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
  const page = list.find((t) => t.type === 'page' && /5178\/$/.test(t.url))
  const s = await Sess.open(page.webSocketDebuggerUrl)
  await s.send('Page.enable')
  await s.send('Runtime.enable')
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await s.send('Page.navigate', { url: 'http://127.0.0.1:5178/' })
  await sleep(6500)

  // hover 第一张卡片，看标题变色 + 光标
  const r = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const a = document.querySelector('.card-hit');
      const rr = a.getBoundingClientRect();
      return { x: Math.round(rr.left + 60), y: Math.round(rr.top + 22) };
    })()`,
  })
  await s.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.result.value.x, y: r.result.value.y, buttons: 0 })
  await sleep(400)

  const check = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const fav = document.querySelector('.fav');
      const f = fav.getBoundingClientRect();
      const top = document.elementFromPoint(f.left + f.width/2, f.top + f.height/2);
      const h3 = document.querySelector('.card h3');
      return { favHit: top && top.tagName, favZ: getComputedStyle(fav).zIndex,
               h3Color: getComputedStyle(h3).color,
               anchorPe: getComputedStyle(document.querySelector('.card-hit')).pointerEvents };
    })()`,
  })
  console.log('卡片检查：', check.result.value)

  const shot = await s.send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('list-check.png', Buffer.from(shot.data, 'base64'))
  console.log('已保存 list-check.png')
  process.exit(0)
}
main().catch((e) => { console.error(e.message); process.exit(1) })
