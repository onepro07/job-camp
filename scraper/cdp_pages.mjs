// 在 wrangler pages dev 本地模拟环境里验证：页面能渲染 + /api 转发可用
const CDP = 'http://127.0.0.1:9225'
const BASE = 'http://127.0.0.1:8788'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const list = await (await fetch(`${CDP}/json/list`)).json()
  let t = list.find((x) => x.type === 'page')
  if (!t) {
    t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
    await sleep(600)
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const send = (method, params = {}) =>
    new Promise((res) => {
      const mid = ++id
      pending.set(mid, res)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result)
      pending.delete(m.id)
    }
  }
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  await send('Page.enable')

  await send('Page.navigate', { url: BASE })
  await sleep(6000)

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    })
    return r.result?.value
  }

  const cards = await evalJs('document.querySelectorAll(".card").length')
  const facetTotal = await evalJs(
    'getComputedStyle(document.body).fontFamily.slice(0,20) + " | title:" + document.title'
  )
  const apiTest = await evalJs(`(async () => {
    const key = ['wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3'];
    const r = await fetch('/api/.cloud/database/rest/v1/jobs?select=id&limit=1', {
      headers: { 'x-wb-webapp-access-key': key ? key[0] : '' }
    });
    const j = await r.json();
    return r.status + ' | rows:' + (Array.isArray(j) ? j.length : 'err:' + JSON.stringify(j).slice(0,80));
  })()`)

  console.log('卡片数:', cards)
  console.log('样式/标题:', facetTotal)
  console.log('/api 转发:', apiTest)

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs')
  fs.writeFileSync('pages-local.png', Buffer.from(shot.data, 'base64'))
  console.log('截图: pages-local.png')
  ws.close()
}

main().catch((e) => console.error('ERR', e))
