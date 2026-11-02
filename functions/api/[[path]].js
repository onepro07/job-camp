/**
 * Cloudflare Pages Function：把浏览器发往 /api/.cloud/... 的请求转发到云服务。
 *
 * 为什么要这层：云数据库按 Origin 白名单校验，只认 job-camp.app.workbuddy.host。
 * 浏览器直连（哪怕带着 publishableKey）会被 403 "the request origin is not allowed"。
 * 转发发生在边缘节点上，是服务端请求，不带浏览器 Origin，因此可以正常拿到数据。
 */
const UPSTREAM = 'https://job-camp.app.workbuddy.host'
const ALLOWED_ORIGIN = 'https://job-camp.app.workbuddy.host'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
  'access-control-expose-headers': '*',
}

export async function onRequest(context) {
  const { request } = context

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const url = new URL(request.url)
  const upstreamPath = url.pathname.replace(/^\/api/, '')
  const target = UPSTREAM + upstreamPath + url.search

  const headers = new Headers(request.headers)
  for (const h of ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-for', 'x-real-ip']) {
    headers.delete(h)
  }
  // 以站点自己的身份请求，网关按白名单放行
  headers.set('origin', ALLOWED_ORIGIN)
  headers.set('referer', ALLOWED_ORIGIN + '/')

  let body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer()
  }

  let res
  try {
    res = await fetch(target, { method: request.method, headers, body })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'upstream_unreachable', detail: String(e?.message ?? e) }), {
      status: 502,
      headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
    })
  }

  const out = new Headers(res.headers)
  // 边缘已解压，这两个头继续透传会让浏览器解析失败
  out.delete('content-encoding')
  out.delete('content-length')
  out.delete('transfer-encoding')
  for (const [k, v] of Object.entries(CORS)) out.set(k, v)

  return new Response(res.body, { status: res.status, headers: out })
}
