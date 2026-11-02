// 诊断：抓 console 报错、页面文本、以及 data/index.json 的实际请求结果
const CDP = process.env.CDP || 'http://127.0.0.1:9228'
const BASE = process.env.TARGET || 'https://job-camp.pages.dev/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
  await sleep(600)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const logs = []
  const reqs = []
  const send = (m, p = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  ws.onmessage = (e) => {
    const x = JSON.parse(e.data)
    if (x.id && pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); return }
    if (x.method === 'Runtime.consoleAPICalled') {
      logs.push(x.params.type + ': ' + x.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ').slice(0, 200))
    }
    if (x.method === 'Runtime.exceptionThrown') {
      const d = x.params.exceptionDetails
      logs.push('EXCEPTION: ' + (d.exception?.description || d.text || '').slice(0, 300))
    }
    if (x.method === 'Network.responseReceived') {
      const u = x.params.response.url
      if (u.includes('/data/') || u.includes('/api/')) reqs.push(x.params.response.status + ' ' + u.replace(BASE, '/'))
    }
    if (x.method === 'Network.loadingFailed') {
      reqs.push('FAIL ' + x.params.errorText + ' ' + (x.params.blockedReason || ''))
    }
  }
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable')

  await send('Page.navigate', { url: BASE })
  await sleep(14000)

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) return 'EXC:' + JSON.stringify(r.exceptionDetails).slice(0, 200)
    return r.result?.value
  }

  console.log('--- 页面文本前 200 字 ---')
  console.log((await ev('document.body.innerText') || '').replace(/\n+/g, ' | ').slice(0, 200))
  console.log('\n--- 手动 fetch data/index.json ---')
  console.log(await ev(`(async () => {
    try {
      const r = await fetch('data/index.json');
      const txt = await r.text();
      return 'status=' + r.status + ' ct=' + (r.headers.get('content-type')||'') + ' len=' + txt.length + ' head=' + txt.slice(0, 40);
    } catch (e) { return 'THROW: ' + e.name + ': ' + e.message; }
  })()`))
  console.log('\n--- 网络请求（data/api） ---')
  console.log(reqs.length ? reqs.slice(0, 10).join('\n') : '(无)')
  console.log('\n--- console ---')
  console.log(logs.length ? logs.slice(0, 8).join('\n') : '(无)')

  ws.close()
}

main().catch((e) => console.error('ERR', e))
