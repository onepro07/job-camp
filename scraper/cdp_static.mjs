// 验证静态模式（GitHub Pages 同款链路）：列表渲染、筛选、收藏落 localStorage、详情新标签
const CDP = 'http://127.0.0.1:9226'
const BASE = 'http://127.0.0.1:5199/?data=static'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const tabs0 = await (await fetch(`${CDP}/json/list`)).json()
  for (const t of tabs0) if (t.type === 'page' && t.url.includes('5199')) {
    await fetch(`${CDP}/json/close/${t.id}`)
  }
  await sleep(500)

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

  await send('Page.navigate', { url: BASE })
  await sleep(7000)

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 160)
    return r.result?.value
  }

  console.log('卡片数:', await ev('document.querySelectorAll(".card").length'))
  console.log('顶栏标识:', await ev('document.querySelector(".local-badge")?.textContent.trim() ?? "(仍显示登录按钮)"'))
  console.log('登录按钮存在:', await ev('!!document.querySelector(".btn-primary.sm")'))
  console.log('列表头部:', await ev('document.querySelector(".list-head, .list-top, .count")?.textContent?.replace(/\\s+/g," ").trim().slice(0,50) ?? "-"'))

  const before = await ev('localStorage.getItem("job-camp:favorites")')
  await ev('document.querySelector(".card .fav")?.click()')
  await sleep(1500)
  const after = await ev('localStorage.getItem("job-camp:favorites")')
  console.log('收藏 localStorage:', before, '→', after)

  const cityItems = await ev(`(async () => {
    const btns = [...document.querySelectorAll('.cmenu')];
    if (!btns.length) return 'no-menu';
    const cell = btns.find(c => /城市/.test(c.textContent)) || btns[0];
    (cell.querySelector('button') || cell).click();
    await new Promise(r => setTimeout(r, 800));
    return document.querySelectorAll('.cmenu-item').length;
  })()`)
  console.log('城市下拉项数:', cityItems)

  await ev(`(() => {
    const inp = document.querySelector('input[type=search], input[placeholder*="搜索"], input');
    if (!inp) return 'no-input';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '工程师');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  })()`)
  await sleep(700)
  await ev(`[...document.querySelectorAll('button')].find(b => /^\\s*搜索/.test(b.textContent))?.click()`)
  await sleep(2500)
  console.log('搜索「工程师」后卡片数:', await ev('document.querySelectorAll(".card").length'))

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('static-list.png', Buffer.from(shot.data, 'base64'))
  console.log('截图: static-list.png')
  ws.close()
}

main().catch((e) => console.error('ERR', e))
