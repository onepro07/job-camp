// 云服务公开配置，来自激活时返回的 publicConfig。可随前端代码一起发布。
export const publicConfig = {
  resourceId: 'wbcs_pGWvS9DdlUmUUsCD1hIqO3',
  endpoint: 'https://job-camp.app.workbuddy.host',
  oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
  publishableKey: 'wbpk_nwNlZ1h7pOQ3LHX58Ws34j_vFqMJilV8JocSACXhnlJ4wntdIAAZaN3',
}

/**
 * 云网关按 Origin 白名单校验，只有官方托管域名能直连。
 * 部署到别处（Cloudflare Pages / 自有域名）时改走同源的 /api 转发，
 * 由 functions/api/[[path]].js 在边缘节点代为请求。
 */
function resolveEndpoint() {
  const host = location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')
  const isNativeHost = host === 'job-camp.app.workbuddy.host' || host.endsWith('.workbuddy.host')
  if (isLocal || isNativeHost) return publicConfig.endpoint
  return `${location.origin}/api`
}

export const apiEndpoint = resolveEndpoint()
