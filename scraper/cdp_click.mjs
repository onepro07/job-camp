/**
 * 用 CDP 真实鼠标点击一张岗位卡片，验证是否新开了一个窗口/标签页。
 * 依赖：Node 22 自带的 WebSocket；Edge 以 --remote-debugging-port 启动。
 */
const CDP = 'http://127.0.0.1:9222'
const BASE = 'http://127.0.0.1:5178/'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function listTargets() {
  const r = await fetch(`${CDP}/json/list`)
  return r.json()
}

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
  send(method, params = {}, sessionId) {
    const id = ++this.id
    return new Promise((res, rej) => {
      this.waiters.set(id, { res, rej })
      this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }
}

const main = async () => {
  const before = await listTargets()
  const page = before.find((t) => t.type === 'page')
  if (!page) throw new Error('没找到预览页面，先打开 about:blank 再导航')

  const s = await Sess.open(page.webSocketDebuggerUrl)
  await s.send('Page.enable')
  await s.send('Runtime.enable')
  await s.send('Page.navigate', { url: BASE })
  await sleep(6000) // 等索引/列表加载完

  const rect = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const a = document.querySelector('.card-hit');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { x: r.left + 40, y: r.top + 20, href: a.getAttribute('href'), target: a.target,
               cards: document.querySelectorAll('.card').length };
    })()`,
  })
  const box = rect.result.value
  console.log('第一个卡片链接：', box)
  if (!box) throw new Error('页面上没有 .card-hit')

  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await s.send('Input.dispatchMouseEvent', {
      type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0,
    })
  }
  await sleep(2500)

  const after = await listTargets()
  const opened = after.filter((t) => t.url.includes('job='))
  console.log('点击后含 job= 的页面：', opened.map((t) => t.url))
  console.log('页面总数：', before.length, '->', after.length)

  // 原页面没有被导航走 = 列表还在，说明不是全页覆盖
  const still = await s.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `({ url: location.href, cards: document.querySelectorAll('.card').length, overlay: !!document.querySelector('.jd-mask') })`,
  })
  console.log('原窗口状态：', still.result.value)

  // 详情窗口截图
  if (opened[0]) {
    const d = await Sess.open(opened[0].webSocketDebuggerUrl)
    await d.send('Page.enable')
    await d.send('Emulation.setDeviceMetricsOverride', { width: 920, height: 1040, deviceScaleFactor: 1, mobile: false })
    await sleep(2500)
    const shot = await d.send('Page.captureScreenshot', { format: 'png' })
    const fs = await import('node:fs')
    fs.writeFileSync('detail-window.png', Buffer.from(shot.data, 'base64'))
    console.log('已保存 detail-window.png')
  }
  process.exit(0)
}

main().catch((e) => { console.error('失败：', e.message); process.exit(1) })
