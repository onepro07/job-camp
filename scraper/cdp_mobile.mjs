// 手机视口检查：iPhone 尺寸下的布局、横向溢出、触控可用性
const CDP = 'http://127.0.0.1:9227'
const URL_LIVE = process.env.TARGET || 'https://onepro07.github.io/job-camp/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }

async function openPage(url, mobile) {
  const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
  await sleep(600)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id) } }
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  await send('Page.enable')
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', MOBILE)
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    })
  }
  await send('Page.navigate', { url })
  await sleep(9000)
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 160)
    return r.result?.value
  }
  return { ws, send, ev, close: () => ws.close() }
}

async function main() {
  // 1) 手机列表页
  const list = await openPage(URL_LIVE, true)
  console.log('--- 手机列表 ---')
  console.log('总数:', await list.ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/)||[])[1]'))
  console.log('卡片:', await list.ev('document.querySelectorAll(".card").length'))
  console.log('横向溢出:', await list.ev('document.documentElement.scrollWidth - document.documentElement.clientWidth'))
  console.log('搜索按钮可见:', await list.ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /搜索/.test(x.textContent));
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 20 && r.right <= window.innerWidth + 1;
  })()`))
  console.log('首屏文字:', await list.ev('document.querySelector("h1, .hero h1, .hero-title")?.textContent?.trim().slice(0,40) ?? "-"'))
  const s1 = await list.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const fs = await import('node:fs')
  fs.writeFileSync('mobile-list.png', Buffer.from(s1.data, 'base64'))

  // 2) 手机详情页
  const detailUrl = await list.ev('document.querySelector(".card-hit")?.href ?? ""')
  list.close()
  console.log('\n--- 手机详情 ---')
  console.log('链接:', detailUrl)
  const det = await openPage(detailUrl, true)
  console.log('标题:', await det.ev('document.title'))
  console.log('meta 行:', await det.ev('document.querySelectorAll(".jd-meta > div").length'))
  console.log('横向溢出:', await det.ev('document.documentElement.scrollWidth - document.documentElement.clientWidth'))
  console.log('投递按钮可见:', await det.ev(`(() => {
    const a = [...document.querySelectorAll('a,button')].find(x => /去原站投递/.test(x.textContent));
    if (!a) return false;
    const r = a.getBoundingClientRect();
    return r.width > 40 && r.top >= 0 && r.top < window.innerHeight * 3;
  })()`))
  console.log('返回入口:', await det.ev('!!document.querySelector(".jd-back") || !!document.querySelector("a[href*=\\"job-camp\\"]")'))
  const s2 = await det.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync('mobile-detail.png', Buffer.from(s2.data, 'base64'))
  det.close()

  console.log('\n截图: mobile-list.png / mobile-detail.png')
}

main().catch((e) => console.error('ERR', e))
