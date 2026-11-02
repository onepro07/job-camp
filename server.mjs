/**
 * 生产启动入口：把 dist 当静态站点服务出去。
 * 平台会把 PORT 注入环境变量并要求 0.0.0.0，所以这里不能用 vite dev/preview 的默认端口。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { extname, join, normalize, sep } from 'node:path'

const PORT = Number(process.env.PORT) || 3000
const ROOT = fileURLToPath(new URL('./dist/', import.meta.url))
const INDEX = join(ROOT, 'index.html')

// 平台只上传源码、并复用上一轮沙箱里的旧 dist，所以每次启动都重建一遍（失败则退回已有产物）
if (!process.env.SKIP_BUILD) {
  try {
    console.log('构建中…')
    execSync('npm run build', { stdio: 'inherit', cwd: fileURLToPath(new URL('./', import.meta.url)) })
  } catch (e) {
    console.error('构建失败，继续使用已有 dist：', e?.message ?? e)
  }
}

if (!existsSync(INDEX)) {
  console.error('没有可用的 dist/index.html，站点会返回 500')
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname.endsWith('/')) pathname += 'index.html'

    let file = normalize(join(ROOT, pathname))
    // 防目录穿越
    if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) file = INDEX

    let info = await stat(file).catch(() => null)
    if (!info || info.isDirectory()) {
      // 所有路由都落到单页入口（站点用 ?job= 查询参数做详情页）
      file = INDEX
      info = await stat(file).catch(() => null)
    }
    if (!info) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('dist 缺失，构建可能失败了')
      return
    }

    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': file === INDEX ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(file).pipe(res)
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`server error: ${e?.message ?? e}`)
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`jobsite listening on http://0.0.0.0:${PORT} (root: ${ROOT})`)
})
