import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cloud } from './cloud'
import {
  listJobs, getFacets, getJob, listFavoriteIds, addFavorite, removeFavorite,
  listApplications, createApplication, getDataMode,
} from './api'
import type { Job, Application } from './types'
import { SOURCE_LABEL, fmtDate } from './types'

type Facets = {
  cities: [string, number][]
  experiences: [string, number][]
  categories: [string, number][]
  industries: [string, number][]
  companies: [string, number][]
  total: number
}

const EMPTY_FACETS: Facets = { cities: [], experiences: [], categories: [], industries: [], companies: [], total: 0 }
const PAGE_SIZE = 8

/** 由站点自己管理的查询参数；其余参数（如平台注入的 sharecode）必须原样保留 */
const FILTER_KEYS = ['kw', 'city', 'exp', 'cat', 'industry', 'company', 'days', 'job']


export default function App() {
  /* ---------- 登录态 ---------- */
  const [user, setUser] = useState<{ id: string; name?: string } | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  /** 静态部署（GitHub Pages）下没有登录能力，收藏/投递落在本机 */
  const [staticMode, setStaticMode] = useState(false)

  useEffect(() => { getDataMode().then((m) => setStaticMode(m === 'static')).catch(() => {}) }, [])

  /* ---------- 列表 ---------- */
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS)

  // 支持从地址栏带筛选条件进来（分享 / 收藏链接时能还原视图）
  const Q = useMemo(() => new URLSearchParams(location.search), [])
  const [keyword, setKeyword] = useState(Q.get('kw') ?? '')
  const [kwInput, setKwInput] = useState(Q.get('kw') ?? '')
  const [city, setCity] = useState(Q.get('city') ?? '')
  const [exp, setExp] = useState(Q.get('exp') ?? '')
  const [cat, setCat] = useState(Q.get('cat') ?? '')
  const [ind, setInd] = useState(Q.get('industry') ?? '')
  const [comp, setComp] = useState(Q.get('company') ?? '')
  const [days, setDays] = useState(Number(Q.get('days') ?? 0) || 0)

  /* ---------- 收藏 / 投递 ---------- */
  const [favIds, setFavIds] = useState<number[]>([])
  const [apps, setApps] = useState<Application[]>([])
  const [toast, setToast] = useState('')

  const notify = (m: string) => {
    setToast(m)
    window.setTimeout(() => setToast(''), 2600)
  }

  /* ---------- 启动：先处理 OAuth 回调，再恢复会话 ---------- */
  useEffect(() => {
    let alive = true
    ;(async () => {
      const url = new URL(location.href)
      if (url.searchParams.has('code') || url.searchParams.has('error')) {
        const provider = url.searchParams.get('provider')
        if (provider === 'workbuddy' || provider === 'wechat') {
          const fn = provider === 'workbuddy'
            ? (cloud.auth as any).handleWorkBuddyCallback
            : (cloud.auth as any).handleWechatWebCallback
          if (typeof fn === 'function') {
            const { data: session, error: cbErr } = await fn.call(cloud.auth)
            if (cbErr) setError(cbErr.message)
            else if (session) {
              for (const k of ['code', 'state', 'provider']) url.searchParams.delete(k)
              history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
            }
          }
        }
      }
      const { data: session } = await cloud.auth.getSession()
      if (!alive) return
      setUser(session?.user ? { id: session.user.id ?? '', name: session.user.name } : null)
      setAuthReady(true)
    })()
    return () => { alive = false }
  }, [])

  /* ---------- 拉列表 ---------- */
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await listJobs({
        keyword: keyword || undefined,
        city: city || undefined,
        experience: exp || undefined,
        category: cat || undefined,
        industry: ind || undefined,
        company: comp || undefined,
        days: days || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      setJobs(res.rows)
      setTotal(res.total)
    } catch (e: any) {
      setError(e?.message ?? '加载失败')
    } finally {
      setLoading(false)
    }
  }, [keyword, city, exp, cat, ind, comp, days, page])

  const jobParam = Q.get('job')
  useEffect(() => { if (!jobParam) load() }, [load, jobParam])

  // 把当前筛选写回地址栏，方便刷新/分享保持同一视图
  useEffect(() => {
    if (jobParam) return
    // 站点靠 ?sharecode= 授权，改写地址栏时不能把它和别的外来参数洗掉
    const q = new URLSearchParams(location.search)
    for (const k of FILTER_KEYS) q.delete(k)
    if (keyword) q.set('kw', keyword)
    if (city) q.set('city', city)
    if (exp) q.set('exp', exp)
    if (cat) q.set('cat', cat)
    if (ind) q.set('industry', ind)
    if (comp) q.set('company', comp)
    if (days) q.set('days', String(days))
    const qs = q.toString()
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname)
  }, [keyword, city, exp, cat, ind, comp, days, jobParam])

  useEffect(() => {
    getFacets().then(setFacets).catch(() => {})
  }, [])

  /* ---------- 加载个人数据 ----------
     静态模式（GitHub Pages）没有可用的登录态，收藏/投递存在本机 localStorage，
     不依赖 user，所以这里不能直接按「未登录就清空」处理。 */
  useEffect(() => {
    let alive = true
    ;(async () => {
      const mode = await getDataMode()
      if (!alive) return
      if (!user && mode !== 'static') { setFavIds([]); setApps([]); return }
      listFavoriteIds().then((v) => { if (alive) setFavIds(v) }).catch(() => {})
      listApplications().then((v) => { if (alive) setApps(v) }).catch(() => {})
    })()
    return () => { alive = false }
  }, [user])

  const filtered = useMemo(
    () => Boolean(keyword || city || exp || cat || ind || comp || days),
    [keyword, city, exp, cat, ind, comp, days],
  )

  const reset = () => {
    setKeyword(''); setKwInput(''); setCity(''); setExp(''); setCat('')
    setInd(''); setComp(''); setDays(0); setPage(0)
  }

  const toggleFav = async (job: Job) => {
    if (!user && (await getDataMode()) !== 'static') { setLoginOpen(true); return }
    const has = favIds.includes(job.id)
    try {
      if (has) { await removeFavorite(job.id); setFavIds((p) => p.filter((i) => i !== job.id)); notify('已取消收藏') }
      else { await addFavorite(job.id); setFavIds((p) => [...p, job.id]); notify('已收藏') }
    } catch (e: any) { notify(e?.message ?? '操作失败') }
  }

  const shareJob = async (job: Job) => {
    const url = `${location.origin}${location.pathname}?job=${job.id}`
    try {
      await navigator.clipboard.writeText(url)
      notify('岗位链接已复制')
    } catch {
      notify(url)
    }
  }

  const markApplied = async (job: Job) => {
    if (!user && (await getDataMode()) !== 'static') { setLoginOpen(true); return }
    if (apps.some((a) => a.job_id === job.id)) { notify('这个岗位已经在投递记录里了'); return }
    try {
      await createApplication({
        job_id: job.id,
        job_title: job.title,
        company_name: job.company?.name ?? null,
        job_city: job.city,
      })
      const next = await listApplications()
      setApps(next)
      notify('已加入投递记录')
    } catch (e: any) { notify(e?.message ?? '记录失败') }
  }

  // 列表页不需要「分享/标记已投」入口（详情页已有），此处保留供将来扩展
  void shareJob
  void markApplied

  /**
   * 详情链接：带上当前筛选条件，详情页返回时列表视图不丢。
   * 用 <a target="_blank"> 而不是纯 JS window.open —— 用户点击触发的原生跳转
   * 不会被弹窗拦截器拦掉，嵌在 iframe 里也能正常新开。
   */
  const detailHref = (id: number) => {
    const q = new URLSearchParams()
    new URLSearchParams(location.search).forEach((v, k) => { if (k !== 'job') q.set(k, v) })
    q.set('job', String(id))
    return `${location.pathname}?${q.toString()}`
  }

  if (jobParam) {
    const jid = Number(jobParam)
    return Number.isFinite(jid) && jid > 0
      ? <JobDetailPage id={jid} />
      : <div className="jd-page"><div className="jd-card"><p className="jd-p jd-dim">岗位链接无效。</p></div></div>
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">求职营地</span>
            <span className="brand-sub">岗位库</span>
          </div>
          <nav className="nav">
            <a className="nav-item active" href="#jobs">岗位</a>
            <a className="nav-item" href="#apps">投递记录{apps.length > 0 && <em>{apps.length}</em>}</a>
          </nav>
          <div className="userbox">
            {user ? (
              <>
                <span className="avatar">{(user.name ?? '我').slice(0, 1)}</span>
                <span className="uname">{user.name ?? '已登录'}</span>
                <button className="btn-ghost" onClick={async () => { await cloud.auth.signOut(); setUser(null); notify('已退出') }}>退出</button>
              </>
            ) : staticMode ? (
              <span className="local-badge" title="静态部署版本：收藏与投递记录保存在本机浏览器，不跨设备同步">
                本机收藏
              </span>
            ) : (
              <button className="btn-primary sm" onClick={() => setLoginOpen(true)}>登录 / 注册</button>
            )}
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="hero-in">
          <span className="eyebrow">
            <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2.5l2.7 6.4 6.8.55-5.2 4.45 1.6 6.6L12 16.9l-5.9 3.6 1.6-6.6L2.5 9.45l6.8-.55z" fill="currentColor" />
            </svg>
            企业官网 / ATS 直采 · 拒绝虚假过期岗
          </span>
          <h1>官网招聘，<em>一站看全</em></h1>
          <p>聚合腾讯与 {Math.max(0, facets.companies.length - 1)} 家企业官方招聘站的在架岗位，全部标注来源与更新时间。</p>

          <form
            className="searchbar"
            onSubmit={(e) => { e.preventDefault(); setKeyword(kwInput.trim()); setPage(0) }}
          >
            <label className="sb-cell sb-kw">
              <span className="sb-label">关键词</span>
              <input
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                placeholder="职位名称 / 企业名，如 前端、京东方"
                aria-label="搜索岗位关键词"
              />
            </label>

            <span className="sb-sep" aria-hidden="true" />

            <CategoryMenu
              cell
              label="城市"
              placeholder="不限城市"
              value={city}
              items={facets.cities}
              total={facets.total}
              onPick={(v) => { setCity(v); setPage(0) }}
            />

            <button type="submit" className="sb-go">
              <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.9" />
                <path d="M13 13l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
              搜索
            </button>
          </form>
        </div>
      </section>

      <main className="listwrap">
        <div className="toolbar">
          <div className="seg" role="group" aria-label="发布时间">
            {([[0, '全部'], [1, '今日新增'], [3, '近三天'], [7, '近一周']] as [number, string][]).map(([v, label]) => (
              <button
                key={v}
                className={days === v ? 'on' : ''}
                onClick={() => { setDays(v); setPage(0) }}
              >{label}</button>
            ))}
          </div>

          <CategoryMenu
            label="行业" placeholder="全部行业" value={ind} items={facets.industries} total={facets.total}
            onPick={(v) => { setInd(v); setPage(0) }}
          />
          <CategoryMenu
            label="经验" placeholder="不限经验" value={exp} items={facets.experiences} total={facets.total}
            onPick={(v) => { setExp(v); setPage(0) }}
          />
          <CategoryMenu
            label="职能" placeholder="全部职能" value={cat} items={facets.categories} total={facets.total}
            onPick={(v) => { setCat(v); setPage(0) }}
          />
          <CategoryMenu
            label="企业" placeholder="全部企业" value={comp} items={facets.companies} total={facets.total}
            onPick={(v) => { setComp(v); setPage(0) }}
          />

          {filtered && <button className="link" onClick={reset}>清空筛选</button>}
        </div>

        <div className="resultbar">
          {loading ? '加载中…' : <>共 <b>{total}</b> 个岗位</>}
          <span className="rb-sep">·</span>
          <span className="rb-src">覆盖 {facets.companies.length} 家企业 · 数据源 腾讯招聘 / 企业官网</span>
        </div>

        <section className="list" id="jobs">
          {error && <div className="empty">{error}</div>}

          {!loading && !error && jobs.length === 0 && (
            <div className="empty">没有匹配的岗位，试着放宽筛选条件。</div>
          )}

          {jobs.map((j) => (
            <article className="card" key={j.id}>
              {/* 原生链接：直接在新标签页打开完整页面，不弹小窗口 */}
              <a
                className="card-hit"
                href={detailHref(j.id)}
                target="_blank"
                rel="noopener"
                aria-label={`查看岗位详情：${j.title}`}
              />
              <div className="card-main">
                <div className="card-top">
                  <h3>{j.title}</h3>
                  <button
                    className={`fav ${favIds.includes(j.id) ? 'on' : ''}`}
                    onClick={(e) => { e.stopPropagation(); toggleFav(j) }}
                    aria-label={favIds.includes(j.id) ? '取消收藏' : '收藏'}
                  >
                    {favIds.includes(j.id) ? '★' : '☆'}
                  </button>
                </div>
                <div className="card-meta">
                  <span className="company">{j.company?.name ?? '未知企业'}</span>
                  <span className="dot" />
                  <span>{j.city ?? '—'}</span>
                  <span className="dot" />
                  <span>{j.experience ?? '经验不限'}</span>
                  <span className="dot" />
                  <span>{j.job_type ?? '社招'}</span>
                </div>
                <p className="card-desc">{excerpt(j.description)}</p>
                <div className="card-tags">
                  {(j.tags ?? []).map((t) => <span className="tag" key={t}>{t}</span>)}
                  <span className="tag src">{SOURCE_LABEL[j.source] ?? j.source}</span>
                </div>
              </div>
              <div className="card-side">
                <span className="time">{fmtDate(j.published_at)}</span>
                <span className="salary">薪资面议</span>
              </div>
            </article>
          ))}

          {total > PAGE_SIZE && (
            <div className="pager">
              <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>上一页</button>
              <span>{page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
              <button className="btn-ghost" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>下一页</button>
            </div>
          )}
        </section>
      </main>

      <section className="apps" id="apps">
        <h2>投递记录</h2>
        {apps.length === 0 ? (
          <p className="muted">{user || staticMode ? '还没有记录。在岗位详情里点「标记已投递」会自动出现在这里。' : '登录后可记录投递进度。'}</p>
        ) : (
          <div className="app-list">
            {apps.map((a) => (
              <div className="app-row" key={a.id}>
                <div>
                  <b>{a.job_title}</b>
                  <span className="muted"> · {a.company_name ?? '—'} · {a.job_city ?? '—'}</span>
                </div>
                <span className="stage">{stageLabel(a.status)}</span>
                <span className="muted sm">{a.applied_at ?? ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onDone={(u) => { setUser(u); setLoginOpen(false) }} />}

      {toast && <div className="toast">{toast}</div>}
      {!authReady && <div className="boot">正在连接…</div>}
    </div>
  )
}

/** 独立窗口里的岗位详情页（?job=<id>）。 */
function JobDetailPage({ id }: { id: number }) {
  const [job, setJob] = useState<Job | null>(null)
  const [err, setErr] = useState('')
  const [fav, setFav] = useState(false)
  const [tip, setTip] = useState('')

  useEffect(() => {
    let alive = true
    getJob(id)
      .then((j) => {
        if (!alive) return
        if (!j) { setErr('这个岗位不存在，或者已经下线。'); return }
        setJob(j)
        document.title = `${j.title} · ${j.company?.name ?? '求职营地'}`
      })
      .catch((e) => { if (alive) setErr(e?.message ?? '加载失败') })
    listFavoriteIds().then((ids) => { if (alive) setFav(ids.includes(id)) }).catch(() => {})
    return () => { alive = false }
  }, [id])

  const flash = (t: string) => { setTip(t); setTimeout(() => setTip(''), 2000) }

  const onFav = async () => {
    try {
      if (fav) { await removeFavorite(id); setFav(false); flash('已取消收藏') }
      else { await addFavorite(id); setFav(true); flash('已收藏') }
    } catch {
      flash('请先在主页面登录后再收藏')
    }
  }

  const onShare = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      flash('岗位链接已复制')
    } catch { flash(location.href) }
  }

  const backHref = (() => {
    const q = new URLSearchParams(location.search)
    q.delete('job')
    const s = q.toString()
    return s ? `${location.pathname}?${s}` : location.pathname
  })()

  return (
    <div className="jd-page">
      <header className="topbar jd-topbar">
        <div className="topbar-in">
          <a className="brand" href={backHref}>
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">求职营地</span>
            <span className="brand-sub">岗位库</span>
          </a>
          <nav className="nav jd-nav">
            <a className="nav-item" href={backHref}>← 返回岗位库</a>
          </nav>
          <div className="userbox">
            <span className="jd-crumb">岗位详情</span>
          </div>
        </div>
      </header>

      <div className="jd-wrap">
        <main className="jd-main">
      {err && <div className="jd-card"><p className="jd-p jd-dim">{err}</p></div>}
      {!err && !job && <div className="jd-card"><p className="jd-p jd-dim">加载中…</p></div>}

      {job && (
        <article className="jd-card">
          <header className="jd-head">
            <h2>{job.title}</h2>
            <div className="jd-acts">
              <button className={`jd-act ${fav ? 'on' : ''}`} onClick={onFav}>
                <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 2.4l2.3 4.9 5.2.7-3.8 3.6 1 5.1L10 14.3l-4.7 2.4 1-5.1L2.5 8l5.2-.7z"
                    fill={fav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                {fav ? '已收藏' : '收藏'}
              </button>
              <button className="jd-act" onClick={onShare}>
                <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M8 11a3.2 3.2 0 004.6.3l2.6-2.6a3.2 3.2 0 10-4.6-4.6L9.6 5M12 9a3.2 3.2 0 00-4.6-.3L4.8 11.3a3.2 3.2 0 104.6 4.6l1-1"
                    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                分享
              </button>
            </div>
          </header>

          <dl className="jd-meta">
            <div>
              <dt>公司</dt>
              <dd>
                {job.company?.name ?? '未知企业'}
                {job.company?.website && (
                  <a href={job.company.website} target="_blank" rel="noopener noreferrer" className="jd-company">›</a>
                )}
              </dd>
            </div>
            <div><dt>城市</dt><dd>{job.city ?? '未标注'}</dd></div>
            <div><dt>薪资</dt><dd className="jd-dim">未标注</dd></div>
            <div><dt>学历</dt><dd className={job.education ? '' : 'jd-dim'}>{job.education ?? '未标注'}</dd></div>
            <div><dt>经验</dt><dd>{job.experience ?? '未标注'}</dd></div>
            <div><dt>来源</dt><dd>{SOURCE_LABEL[job.source] ?? job.source}</dd></div>
            <div><dt>企业类型</dt><dd className={job.company?.industry ? '' : 'jd-dim'}>{job.company?.industry ?? '未识别'}</dd></div>
            <div><dt>发布时间</dt><dd>{fmtDate(job.published_at) || '—'}</dd></div>
            <div><dt>截止时间</dt><dd className="jd-dim">—</dd></div>
            <div><dt>收录时间</dt><dd>{job.created_at ? job.created_at.slice(0, 10) : '—'}</dd></div>
          </dl>

          <section className="jd-sec">
            <h3>岗位职责</h3>
            <JdBody text={job.description} empty="暂无职责描述，请查看原站。" />
          </section>

          <section className="jd-sec">
            <h3>任职要求</h3>
            <JdBody text={job.requirements} empty="该岗位未提供结构化的任职要求，请查看原站。" />
          </section>

          {job.company?.intro && (
            <section className="jd-sec">
              <h3>关于 {job.company.name}</h3>
              <p className="jd-p">{job.company.intro}</p>
            </section>
          )}

        </article>
      )}
        </main>

        {job && (
          <aside className="jd-side">
            <div className="jd-side-card">
              <a className="btn-primary jd-apply" href={sourceLink(job)} target="_blank" rel="noopener noreferrer">
                去原站投递
              </a>
              <p className="jd-side-note">
                将跳转到{SOURCE_LABEL[job.source] ?? job.source}官方招聘页完成投递，岗位内容以原站为准。
              </p>

              <ul className="jd-facts">
                <li><span>来源</span><b>{SOURCE_LABEL[job.source] ?? job.source}</b></li>
                <li><span>发布时间</span><b>{fmtDate(job.published_at) || '—'}</b></li>
                <li><span>收录时间</span><b>{job.created_at ? job.created_at.slice(0, 10) : '—'}</b></li>
                <li><span>企业类型</span><b>{job.company?.industry ?? '未识别'}</b></li>
              </ul>

              <p className="jd-src">信息来源：企业官方渠道 · 岗位内容以原站为准</p>
            </div>
          </aside>
        )}
      </div>

      {tip && <div className="toast">{tip}</div>}
    </div>
  )
}

/** 把“1、… 2、…”这类 JD 正文拆成条目；拆不出来就按段落显示。 */
function parseItems(text?: string | null): string[] {
  if (!text) return []
  const body = text.replace(/\r/g, ' ').replace(/\n+/g, ' ').trim()
  const parts = body
    .split(/\s*(?=\d{1,2}[、.．]\s*[\u4e00-\u9fa5A-Za-z])/)
    .map((s) => s.replace(/^\s*\d{1,2}[、.．]\s*/, '').trim())
    .filter((s) => s.length > 1)
  return parts.length >= 2 ? parts : []
}

function JdBody({ text, empty }: { text?: string | null; empty: string }) {
  const items = parseItems(text)
  if (items.length >= 2) {
    return (
      <ol className="jd-list">
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ol>
    )
  }
  const plain = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!plain) return <p className="jd-p jd-dim">{empty}</p>
  return <p className="jd-p">{plain}</p>
}

/** 分类下拉：展开是一列「名称 (数量)」，和行业分类表的观感一致。 */
function CategoryMenu({ label, placeholder, value, items, total: grandTotal, onPick, cell }: {
  label: string
  placeholder: string
  value: string
  items: [string, number][]
  /** 不带筛选的岗位总数，用于「全部 xx」那一行 */
  total?: number
  onPick: (v: string) => void
  /** 搜索栏里的单元格形态：标签在上、值在下 */
  cell?: boolean
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null
  const total = grandTotal ?? items.reduce((sum, [, n]) => sum + n, 0)

  return (
    <div className={`cmenu ${cell ? 'cell' : ''} ${value ? 'on' : ''}`} ref={box}>
      <button
        type="button"
        className="cmenu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="fsel-lb">{label}</span>
        <span className="cmenu-line">
          <span className={`cmenu-val ${value ? '' : 'ph'}`}>{value || placeholder}</span>
          <svg className="cmenu-caret" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="cmenu-pop" role="listbox" aria-label={label}>
          <button
            className={`cmenu-item ${value === '' ? 'on' : ''}`}
            onClick={() => { onPick(''); setOpen(false) }}
          >
            <span>全部{label}</span><em>{total}</em>
          </button>
          {items.map(([name, n]) => (
            <button
              key={name}
              className={`cmenu-item ${value === name ? 'on' : ''}`}
              onClick={() => { onPick(name); setOpen(false) }}
            >
              <span>{name}</span><em>{n}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 老数据存了 source_url，新导入的只存 source_id，这里统一兜底。 */
function sourceLink(j: Job): string {
  if (j.source_url) return j.source_url
  if (j.source === 'tencent' && j.source_id) {
    return `http://careers.tencent.com/jobdesc.html?postId=${j.source_id}`
  }
  return '#'
}

/** 把“1.负责…；2.负责…”这类职责原文压成一句可扫读的摘要。 */
function excerpt(text: string | null): string {
  if (!text) return '暂无描述'
  const cleaned = text
    .replace(/\r/g, '')
    .replace(/^[\d]+[.、．]\s*/gm, '')            // 行首编号
    .replace(/([；;。])\s*[\d]+[.、．]\s*/g, '$1') // 句中编号（1.…；2.… 压成单行后）
    .replace(/[；;]\s*/g, '，')
    .replace(/\s+/g, ' ')
    .trim()
  const first = cleaned.split('。')[0] || cleaned
  return first.length > 52 ? first.slice(0, 52) + '…' : first
}

function stageLabel(s: string) {
  const map: Record<string, string> = {
    applied: '已投递', screening: '筛选中', interview: '面试中', offer: '已录用', rejected: '未通过',
  }
  return map[s] ?? s
}

/* ---------------- 登录弹层 ---------------- */
function LoginModal({ onClose, onDone }: {
  onClose: () => void
  onDone: (u: { id: string; name?: string }) => void
}) {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [phoneErr, setPhoneErr] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [pending, setPending] = useState<{ phone: string; verificationId: string; isExistingUser: boolean } | null>(null)

  useEffect(() => {
    if (countdown <= 0) return
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [countdown])

  const send = async () => {
    if (!/^1\d{10}$/.test(phone)) { setPhoneErr('请输入正确的 11 位手机号'); return }
    setPhoneErr(''); setErr(''); setSending(true)
    try {
      const r: any = await (cloud.auth as any).sendOtp({ phone })
      if (r.error) { setErr(r.error.message); return }
      setPending({ phone, verificationId: r.data.verificationId, isExistingUser: r.data.isExistingUser })
      setCountdown(60)
    } catch (e: any) { setErr(e?.message ?? '发送失败') }
    finally { setSending(false) }
  }

  const submit = async () => {
    if (!pending) { setErr('请先获取验证码'); return }
    if (pending.phone !== phone) { setErr('手机号已变更，请重新获取验证码'); return }
    setErr(''); setVerifying(true)
    try {
      const r: any = await (cloud.auth as any).verifyOtp({
        phone: pending.phone,
        verificationId: pending.verificationId,
        isExistingUser: pending.isExistingUser,
        token: code,
      })
      if (r.error) { setErr(r.error.message); return }
      onDone({ id: r.data?.user?.id ?? '', name: r.data?.user?.name })
    } catch (e: any) { setErr(e?.message ?? '登录失败') }
    finally { setVerifying(false) }
  }

  const wechat = async () => {
    try {
      const r: any = await (cloud.auth as any).signInWithOAuth({
        provider: 'wechat',
        redirectTo: location.origin,
      })
      if (r.error) { setErr(r.error.message); return }
      location.assign(r.data.url)
    } catch (e: any) { setErr(e?.message ?? '微信登录暂不可用') }
  }

  return (
    <div className="drawer-mask center" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose} aria-label="关闭">×</button>
        <h3>登录求职营地</h3>
        <p className="muted sm">登录后可收藏岗位、记录投递进度。未登录也能浏览全部岗位。</p>

        <label className="field">
          <span>手机号</span>
          <input
            value={phone}
            inputMode="numeric"
            placeholder="11 位手机号"
            onChange={(e) => { setPhone(e.target.value.trim()); setPhoneErr('') }}
          />
        </label>
        {phoneErr && <div className="field-err">{phoneErr}</div>}

        <label className="field">
          <span>验证码</span>
          <div className="code-row">
            <input value={code} inputMode="numeric" placeholder="6 位验证码" onChange={(e) => setCode(e.target.value.trim())} />
            <button type="button" className="btn-ghost sm" onClick={send} disabled={sending || countdown > 0}>
              {countdown > 0 ? `${countdown}s` : sending ? '发送中' : '获取验证码'}
            </button>
          </div>
        </label>

        {err && <div className="field-err">{err}</div>}

        <button className="btn-primary block" onClick={submit} disabled={verifying}>
          {verifying ? '登录中…' : '登录 / 注册'}
        </button>

        <div className="or"><span>或</span></div>
        <button className="btn-ghost block" onClick={wechat}>微信登录</button>
        <p className="tip">微信登录需在已发布域名下使用，本地预览不可用。</p>
      </div>
    </div>
  )
}
