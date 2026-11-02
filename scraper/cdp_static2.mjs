// 静态模式二次校验：总数、关键词过滤、分页
const CDP = 'http://127.0.0.1:9226'
const BASE = 'http://127.0.0.1:5199/?data=static'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
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

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 150)
    return r.result?.value
  }
  const total = () => ev('(document.body.innerText.match(/共\\s*(\\d+)\\s*个岗位/) || [])[1]')

  await send('Page.navigate', { url: BASE })
  await sleep(7000)
  console.log('初始总数:', await total(), '| 卡片:', await ev('document.querySelectorAll(".card").length'))

  // 关键词
  await ev(`(() => {
    const inp = document.querySelector('input[aria-label*="关键词"], input[placeholder*="关键词"], .searchbar input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, '工程师');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('搜索'));
    btn.click();
    return 'ok';
  })()`)
  await sleep(2500)
  console.log('搜索「工程师」后总数:', await total(), '| 卡片:', await ev('document.querySelectorAll(".card").length'))

  // 清空筛选后翻页
  await ev(`[...document.querySelectorAll('button')].find(b => /清空筛选/.test(b.textContent))?.click()`)
  await sleep(2000)
  const first1 = await ev('document.querySelector(".card h3")?.textContent')
  await ev(`[...document.querySelectorAll('button')].find(b => /下一页/.test(b.textContent))?.click()`)
  await sleep(2500)
  const first2 = await ev('document.querySelector(".card h3")?.textContent')
  console.log('清空后总数:', await total())
  console.log('第1页首条:', first1)
  console.log('第2页首条:', first2, '| 变化:', first1 !== first2)

  // 城市筛选（点下拉里的「深圳」）
  await ev(`(async () => {
    const cell = [...document.querySelectorAll('.cmenu')].find(c => /不限城市|城市/.test(c.textContent));
    (cell.querySelector('button') || cell).click();
    await new Promise(r => setTimeout(r, 700));
    const item = [...document.querySelectorAll('.cmenu-item')].find(e => /深圳/.test(e.textContent));
    item?.click();
    return 'clicked';
  })()`)
  await sleep(2500)
  console.log('筛选「深圳」后总数:', await total())

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('static-filtered.png', Buffer.from(shot.data, 'base64'))
  console.log('截图: static-filtered.png')
  ws.close()
}

main().catch((e) => console.error('ERR', e))
