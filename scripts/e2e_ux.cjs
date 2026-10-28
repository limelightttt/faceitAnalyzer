/* UX & network-resilience browser E2E (Playwright). Self-contained like e2e_beta.cjs: starts the MOCK FACEIT
 * API and the app (built frontend) in a fresh data dir. Checks intermediate states, not only end results:
 * sign-in phases, delayed/failed/cancelled requests, long jobs in the background, upload lifecycle, settings
 * pending/success/error, offline, server down, session expiry, Slow 3G / Fast 3G (CDP throttling), reduced
 * motion and phone width. Everything runs against simulated FACEIT data — NOT a live FACEIT/Steam check.
 * Usage: node scripts/e2e_ux.cjs [screenshot-dir]                                                            */
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const BASE = 'http://localhost:8020'
const MOCK = 'http://127.0.0.1:8912'
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-ux-'))
const SHOTS = process.argv[2] ?? path.join(DATA, 'shots')
const DEMO = path.join(ROOT, 'samples', 'test_demo_mirage.dem')
fs.mkdirSync(SHOTS, { recursive: true })
const procs = {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ok = (c, m) => {
  if (!c) throw new Error('FAILED: ' + m)
  console.log('ok -', m)
}
const note = (m) => console.log('   ', m)

function start(name, args, env) {
  const p = spawn('uv', ['run', ...args], { cwd: path.join(ROOT, 'backend'), env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] })
  p.stderr.on('data', (d) => fs.appendFileSync(path.join(DATA, `${name}.log`), d))
  procs[name] = p
}
async function waitUrl(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).status < 500) return
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error('service did not start: ' + url)
}

const toast = (page, text) => page.locator('[data-sonner-toast]').filter({ hasText: text })
const shot = (page, name, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full })
async function devLogin(page, nick = 'scout_me') {
  await page.evaluate(async (n) => {
    await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faceit_nickname: n }) })
  }, nick)
}
/** Records whether any skeleton block was ever rendered while `fn` runs (client-side navigation only). */
async function skeletonSeenDuring(page, fn) {
  await page.evaluate(() => {
    window.__sk = false
    window.__skObs?.disconnect()
    window.__skObs = new MutationObserver(() => {
      if (document.querySelector('.skeleton')) window.__sk = true
    })
    window.__skObs.observe(document.body, { childList: true, subtree: true })
  })
  await fn()
  return page.evaluate(() => window.__sk)
}
async function spaGo(page, to) {
  await page.evaluate((t) => {
    window.history.pushState({}, '', t)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, to)
}
async function throttle(page, profile) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile })
  return cdp
}
// Chrome DevTools presets (throughput in bytes/s)
const SLOW_3G = { latency: 2000, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (500 * 1024) / 8 }
const FAST_3G = { latency: 563, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }

;(async () => {
  start('mock', ['python', '-m', 'tests.support.mock_faceit', '--port', '8912'])
  start('app', ['uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8020'], {
    FACEIT_API_BASE: `${MOCK}/data/v4`, FACEIT_API_KEY: 'test-key', FACEIT_REQUESTS_PER_SECOND: '25',
    AUTH_DEV_LOGIN: 'true', DATA_DIR: DATA, APP_BASE_URL: BASE, REQUIRE_LOGIN: 'true', TRACKING_INTERVAL_MINUTES: '0', PREDICTION_CHECK_MINUTES: '0',
    CORS_ORIGINS: JSON.stringify([BASE]),
  })
  await waitUrl(`${MOCK}/admin/upcoming`)
  await waitUrl(`${BASE}/api/health`)
  const browser = await chromium.launch()
  const errors = []
  const watch = (page) => page.on('pageerror', (e) => errors.push(e.message))
  let page
  try {
    // ── 1. Sign-in phases ────────────────────────────────────────────────────────────────────────────
    let ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    page = await ctx.newPage()
    watch(page)
    await page.goto(BASE + '/')
    await page.getByRole('heading', { name: 'Вход' }).waitFor()
    await shot(page, 'auth-1-idle')
    ok(true, 'auth: idle card with providers')
    // the provider answers 204: the browser stays on the page, frozen in "redirecting" like a slow provider
    await page.route('**/api/auth/steam/start**', (r) => r.fulfill({ status: 204 }))
    const clickAt = Date.now()
    await page.getByRole('link', { name: 'Войти через Steam' }).click({ noWaitAfter: true })
    await page.getByRole('heading', { name: 'Переходим в Steam…' }).waitFor({ timeout: 2000 })
    ok(Date.now() - clickAt < 1000, `auth: click answers immediately with "redirecting" (${Date.now() - clickAt} ms)`)
    await shot(page, 'auth-2-redirecting')
    await page.getByText('открывается дольше обычного').waitFor({ timeout: 12000 })
    ok(true, 'auth: a provider that does not open gets a hint and a way back')
    await page.getByRole('button', { name: 'Назад к входу' }).click()
    await page.getByRole('heading', { name: 'Вход' }).waitFor()
    ok(true, 'auth: back to idle after cancelling the redirect')
    await page.unroute('**/api/auth/steam/start**')
    // callback error → error state → retry
    await page.goto(BASE + '/?auth_error=' + encodeURIComponent('Steam не подтвердил вход'))
    await page.getByRole('heading', { name: 'Вход не завершён' }).waitFor()
    await shot(page, 'auth-3-error')
    await page.getByRole('button', { name: 'Попробовать снова' }).click()
    await page.getByRole('heading', { name: 'Вход' }).waitFor()
    ok(!page.url().includes('auth_error'), 'auth: failed login → readable error → retry returns to idle with a clean URL')
    // returning from the provider: verifying (server not answered yet) → success → app
    await page.evaluate(() => sessionStorage.setItem('fi-auth-pending', JSON.stringify({ provider: 'steam', at: Date.now() })))
    await devLogin(page)
    await page.route('**/api/auth/me', async (r) => {
      await sleep(1500)
      await r.continue().catch(() => {})
    })
    await page.goto(BASE + '/')
    await page.getByRole('heading', { name: 'Проверяем вход…' }).waitFor({ timeout: 3000 })
    await shot(page, 'auth-4-verifying')
    ok(!(await page.getByText('Вход подтверждён').isVisible()), 'auth: no success before the server confirmed the session')
    await page.getByRole('heading', { name: 'Вход подтверждён' }).waitFor({ timeout: 5000 })
    await sleep(500)
    await shot(page, 'auth-5-success')
    await page.unroute('**/api/auth/me')
    const t0 = Date.now()
    await page.getByText('Ваш профиль').waitFor({ timeout: 5000 })
    ok(Date.now() - t0 < 2500, `auth: success hands over to the app without a long artificial pause (${Date.now() - t0} ms)`)

    // ── 2. Player: delayed load, cached navigation, refetch, errors ─────────────────────────────────────
    await page.route('**/api/players/duo_a/overview**', async (r) => {
      await sleep(1500)
      await r.continue().catch(() => {})
    })
    const sawSkeleton = await skeletonSeenDuring(page, async () => {
      await page.getByLabel('Никнейм FACEIT').first().fill('duo_a')
      await page.getByRole('button', { name: 'Анализ' }).first().click()
      await page.waitForTimeout(700)
      await shot(page, 'player-1-skeleton')
      await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
    })
    ok(sawSkeleton, 'player: a slow first load shows a content-shaped skeleton')
    await page.unroute('**/api/players/duo_a/overview**')
    await sleep(400)
    await shot(page, 'player-2-loaded', true)
    const cachedFlash = await skeletonSeenDuring(page, async () => {
      await page.getByRole('link', { name: 'Матчи', exact: true }).click()
      await page.getByText('История матчей').waitFor()
      await page.getByRole('link', { name: 'Обзор', exact: true }).click()
      await page.getByText('Win rate').first().waitFor()
    })
    ok(!cachedFlash, 'player: switching between loaded tabs never flashes a skeleton')
    // sample size change: old numbers stay while the new sample loads
    await page.route('**/api/players/duo_a/overview?limit=20', async (r) => {
      await sleep(1500)
      await r.continue().catch(() => {})
    })
    await page.getByRole('combobox', { name: 'Размер выборки' }).click()
    await page.getByRole('option', { name: '20 матчей' }).click()
    await page.getByText('Обновляем данные').waitFor({ timeout: 3000 })
    ok(await page.getByText('Win rate').first().isVisible(), 'player: refetch keeps the current data visible with an "updating" hint')
    await page.getByText('Обновляем данные').waitFor({ state: 'detached', timeout: 30000 })
    await page.unroute('**/api/players/duo_a/overview?limit=20')
    // errors
    await spaGo(page, '/players/no_such_player_zz')
    await page.getByText('не найден на FACEIT').first().waitFor({ timeout: 30000 })
    ok(await page.getByLabel('Никнейм FACEIT').last().isVisible(), 'player: not found is named and offers a new search')
    await shot(page, 'player-3-not-found')
    let fail500 = true
    await page.route('**/api/players/duo_b/overview**', (r) =>
      fail500 ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Внутренняя ошибка сервера (KeyError)' }) }) : r.continue(),
    )
    await spaGo(page, '/players/duo_b')
    await page.getByText('Ошибка на сервере').waitFor({ timeout: 15000 })
    ok(!(await page.getByText('KeyError').isVisible()), 'player: 500 shows a human message, no raw exception')
    await shot(page, 'player-4-error-500')
    fail500 = false
    await page.getByRole('button', { name: 'Повторить' }).click()
    await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
    ok(true, 'player: retry after a server error loads the data')
    await page.unroute('**/api/players/duo_b/overview**')
    await page.route('**/api/players/duo_c/overview**', (r) =>
      r.fulfill({ status: 429, headers: { 'Retry-After': '900' }, contentType: 'application/json', body: JSON.stringify({ detail: 'FACEIT API: лимит запросов', source: 'faceit' }) }),
    )
    await spaGo(page, '/players/duo_c')
    await page.getByText('Лимит запросов FACEIT').waitFor({ timeout: 15000 })
    ok(await page.getByText(/Повторить можно после/).isVisible(), 'player: FACEIT 429 explains when to retry')
    await page.unroute('**/api/players/duo_c/overview**')
    await page.route('**/api/players/duo_c/overview**', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'FACEIT API недоступен', source: 'faceit' }) }))
    await page.getByRole('button', { name: 'Повторить' }).click().catch(() => {})
    await spaGo(page, '/players/duo_c?limit=100')
    await page.getByText('FACEIT временно недоступен').waitFor({ timeout: 15000 })
    ok(true, 'player: FACEIT outage is told apart from a broken app')
    await page.unroute('**/api/players/duo_c/overview**')
    // a request abandoned by navigation must not surface as an error
    await page.route('**/api/players/zed_slow/overview**', async (r) => {
      await sleep(3000)
      await r.continue().catch(() => {})
    })
    await spaGo(page, '/players/zed_slow')
    await sleep(400)
    await page.getByRole('link', { name: 'Прогнозы', exact: true }).click()
    await page.getByRole('heading', { name: 'Проверка прогнозов' }).waitFor()
    await sleep(3500)
    ok((await page.locator('[data-sonner-toast]').count()) === 0 && !(await page.getByRole('alert').count()), 'cancelled request: no false error after navigating away')
    await page.unroute('**/api/players/zed_slow/overview**')

    // ── 3. Match Scout: progress, background completion, failure + retry ──────────────────────────────
    const up = await (await fetch(`${MOCK}/admin/upcoming`)).json()
    await fetch(`${MOCK}/admin/latency/700`, { method: 'POST' }) // a realistic slow FACEIT: the job takes a while
    await page.getByRole('link', { name: 'Разведка', exact: true }).click()
    await page.getByLabel('Ссылка на комнату матча FACEIT').fill(`https://www.faceit.com/en/cs2/room/${up.match_id}`)
    await page.getByRole('button', { name: 'Разведка' }).click()
    await page.waitForURL(/\/scout\/[0-9a-f]{12}$/)
    await page.getByText(/Шаг \d из 3/).waitFor({ timeout: 10000 })
    const bar = page.getByRole('progressbar', { name: 'Прогресс операции' })
    const p1 = Number(await bar.getAttribute('aria-valuenow'))
    await shot(page, 'scout-1-progress')
    await sleep(1500)
    const p2 = Number((await bar.getAttribute('aria-valuenow').catch(() => '100')) ?? 100)
    ok(p2 >= p1, `scout: real server progress advances (${p1}% → ${p2}%)`)
    const scoutUrl = page.url()
    await page.getByRole('link', { name: 'Коуч', exact: true }).click()
    await fetch(`${MOCK}/admin/latency/0`, { method: 'POST' })
    const ready = toast(page, 'Разведка готова')
    await ready.waitFor({ timeout: 180000 })
    await shot(page, 'scout-2-background-toast')
    await ready.getByRole('button', { name: 'Открыть' }).click()
    await page.waitForURL(scoutUrl)
    await page.locator('text=угроза').nth(9).waitFor({ timeout: 30000 })
    ok(true, 'scout: finishing in the background raises a toast that leads back to the report')
    await sleep(800)
    await shot(page, 'scout-3-report', true)
    await page.getByRole('link', { name: 'Разведка', exact: true }).click()
    await page.getByLabel('Ссылка на комнату матча FACEIT').fill('https://www.faceit.com/en/cs2/room/1-00000000-0000-4000-8000-000000000000')
    await page.getByRole('button', { name: 'Разведка' }).click()
    await page.getByRole('button', { name: 'Запустить заново' }).waitFor({ timeout: 30000 })
    await shot(page, 'scout-4-error')
    ok(await page.getByText(/не найден/).first().isVisible(), 'scout: a failed job shows the reason and a retry')

    // ── 4. Demo upload: progress, cancel, failure + retry, processing, duplicate ──────────────────────
    await page.getByRole('link', { name: 'Демки', exact: true }).click()
    await page.getByText('Перетащите CS2-демку сюда').waitFor()
    const net = await throttle(page, { latency: 20, downloadThroughput: -1, uploadThroughput: 6 * 1024 * 1024 })
    await page.locator('input[type=file]').setInputFiles(DEMO)
    await page.getByText(/Загрузка \d+%/).waitFor({ timeout: 10000 })
    await sleep(1200)
    await shot(page, 'demo-1-uploading')
    const pctText = await page.getByText(/Загрузка \d+%/).textContent()
    ok(/Загрузка ([1-9]\d?)%/.test(pctText), `demo: real upload progress is shown (${pctText.match(/\d+%/)[0]})`)
    await page.getByRole('button', { name: 'Отменить' }).click()
    await page.getByText('Загрузка отменена.').waitFor()
    ok(true, 'demo: an upload can be cancelled')
    await net.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    let failUpload = true
    await page.route('**/api/demos', (r) =>
      r.request().method() === 'POST' && failUpload ? r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'disk error' }) }) : r.continue(),
    )
    await page.locator('input[type=file]').setInputFiles(DEMO)
    await page.getByRole('button', { name: 'Повторить загрузку' }).waitFor({ timeout: 20000 })
    ok(await page.getByRole('alert').filter({ hasText: 'Сервер не смог обработать запрос' }).isVisible(), 'demo: failed upload shows an inline error and a retry')
    ok((await toast(page, 'Сервер не смог обработать запрос').count()) === 0, 'demo: no duplicate toast next to the inline error')
    failUpload = false
    await page.getByRole('button', { name: 'Повторить загрузку' }).click()
    await page.waitForURL(/demos\/[0-9a-f]{12}/, { timeout: 60000 })
    await page.getByText(/Разбираем «/).waitFor({ timeout: 10000 }).then(() => shot(page, 'demo-2-processing')).catch(() => note('parsing finished before the processing state could be captured'))
    await page.getByText('Таймлайн раундов').waitFor({ timeout: 180000 })
    ok(true, 'demo: retry uploads, the server processes it, the analysis opens')
    await page.unroute('**/api/demos')
    await page.getByRole('link', { name: 'Демки', exact: true }).click()
    await page.locator('input[type=file]').setInputFiles(DEMO)
    await toast(page, 'Эта демка уже загружена').waitFor({ timeout: 60000 })
    ok(true, 'demo: the same file again opens the existing analysis with an explanation')

    // ── 5. Settings: pending, double submit, success, inline error ────────────────────────────────────
    await page.goto(BASE + '/settings')
    await page.getByText('Предпочтения').waitFor({ timeout: 30000 })
    let puts = 0
    await page.route('**/api/me/settings', async (r) => {
      if (r.request().method() !== 'PUT') return r.continue()
      puts++
      await sleep(1200)
      await r.continue().catch(() => {})
    })
    const save = page.getByRole('button', { name: 'Сохранить' })
    ok(await save.isDisabled(), 'settings: nothing to save before a change')
    await page.getByRole('button', { name: 'Nuke' }).click()
    await page.getByText('Есть несохранённые изменения').waitFor()
    await save.dblclick()
    ok((await save.getAttribute('aria-busy')) === 'true', 'settings: save shows its pending state immediately')
    await shot(page, 'settings-1-saving')
    await toast(page, 'Настройки сохранены').waitFor({ timeout: 10000 })
    await page.getByText('Сохранено', { exact: true }).waitFor()
    ok(puts === 1, `settings: double click sends one request (${puts})`)
    await shot(page, 'settings-2-saved')
    await page.unroute('**/api/me/settings')
    await page.route('**/api/me/settings', (r) => (r.request().method() === 'PUT' ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"x"}' }) : r.continue()))
    await page.getByRole('button', { name: 'Inferno' }).click()
    await save.click()
    await page.getByRole('alert').filter({ hasText: 'Сервер не смог обработать запрос' }).waitFor()
    ok((await toast(page, 'Сервер не смог').count()) === 0 && !(await page.getByText('Сохранено', { exact: true }).isVisible()), 'settings: failure is inline, never shown as saved')
    await page.unroute('**/api/me/settings')

    // ── 6. Offline, server down, recovery ─────────────────────────────────────────────────────────────
    await spaGo(page, '/players/duo_a') // this document has the player page code; /predictions it has not
    await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
    await page.getByRole('link', { name: 'Главная', exact: true }).click()
    await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
    await ctx.setOffline(true)
    await page.getByText('Нет подключения к интернету.').waitFor({ timeout: 5000 })
    ok(await page.getByText('Win rate').first().isVisible(), 'offline: banner shown, loaded data stays visible')
    await spaGo(page, '/players/enemy_c')
    await page.getByText('Данные загрузятся автоматически').waitFor({ timeout: 10000 })
    ok(!(await page.locator('.skeleton').count()), 'offline: an uncached page waits with a clear state, not an endless skeleton')
    await shot(page, 'net-1-offline')

    await ctx.setOffline(false)
    await toast(page, 'Соединение восстановлено').waitFor({ timeout: 10000 })
    await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
    ok(!(await page.getByText('Нет подключения к интернету.').isVisible()), 'recovery: banner gone, toast shown, the waiting page loads by itself')
    // the page code must really come from the network: drop the browser's HTTP cache first
    await (await ctx.newCDPSession(page)).send('Network.clearBrowserCache')
    await ctx.setOffline(true)
    await spaGo(page, '/coach')
    await page.getByText('Страница откроется автоматически').waitFor({ timeout: 15000 })
    ok(!(await page.getByText('Unexpected Application Error').count()), 'offline: a page whose code never loaded explains itself (no raw router error)')
    await shot(page, 'net-1b-offline-page-code')
    await ctx.setOffline(false)
    await page.getByText('Форма по неделям').waitFor({ timeout: 60000 })
    ok(true, 'recovery: that page opens by itself when the connection returns')
    await page.route('**/api/**', (r) => r.abort('connectionrefused'))
    await spaGo(page, '/players/enemy_d')
    await page.getByText('Сервер FACEIT Intelligence не отвечает.').waitFor({ timeout: 15000 })
    ok(await page.getByText('Сервер FACEIT Intelligence недоступен').isVisible(), 'server down: banner + explanation, distinct from "no internet"')
    await shot(page, 'net-2-server-down')
    await page.unroute('**/api/**')
    await page.getByRole('button', { name: 'Проверить' }).click()
    await toast(page, 'Соединение восстановлено').first().waitFor({ timeout: 10000 })
    await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
    ok(true, 'server back: "Проверить" reconnects and the page loads')
    // session expiry
    await ctx.clearCookies()
    await page.getByRole('link', { name: 'Коуч', exact: true }).click()
    await page.getByText('Сессия истекла').waitFor({ timeout: 15000 })
    await shot(page, 'auth-6-expired')
    ok(await page.getByRole('heading', { name: 'Вход' }).isVisible(), 'expired session: sign-in card explains why it appeared')
    await ctx.close()

    // ── 7. Slow 3G and Fast 3G (real CDP throttling of latency and bandwidth, cold cache) ─────────────
    for (const [label, profile, budget] of [['Fast 3G', FAST_3G, 30000], ['Slow 3G', SLOW_3G, 90000]]) {
      ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
      page = await ctx.newPage()
      watch(page)
      await page.goto(BASE + '/')
      await devLogin(page)
      const cdp = await throttle(page, profile)
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      let t = Date.now()
      await page.goto(BASE + '/', { waitUntil: 'commit' })
      await page.getByText('Ваш профиль').waitFor({ timeout: budget })
      note(`${label}: dashboard shell visible after ${Date.now() - t} ms (cold, no cache)`)
      await page.getByText('Win rate').first().waitFor({ timeout: budget * 2 })
      note(`${label}: dashboard data after ${Date.now() - t} ms`)
      t = Date.now()
      await page.getByLabel('Никнейм FACEIT').first().fill('duo_a')
      await page.getByRole('button', { name: 'Анализ' }).first().click()
      if (label === 'Slow 3G') {
        await page.getByRole('progressbar', { name: 'Загрузка страницы' }).waitFor({ timeout: 5000 })
        note('Slow 3G: route progress bar shown while the page code downloads; previous page stays visible')
        await shot(page, 'net-3-slow3g-route-loading')
      }
      await page.getByText('Win rate').first().waitFor({ timeout: budget * 2 })
      note(`${label}: player page (lazy chunk + cached data) after ${Date.now() - t} ms`)
      t = Date.now()
      await page.getByRole('link', { name: 'Аккаунт' }).click()
      await page.getByText('Предпочтения').waitFor({ timeout: budget })
      await page.getByRole('button', { name: 'Ancient' }).click()
      const s = page.getByRole('button', { name: 'Сохранить' })
      const clicked = Date.now()
      await s.click()
      const busy = await s.getAttribute('aria-busy')
      ok(busy === 'true' && Date.now() - clicked < 1000, `${label}: actions respond immediately (pending after ${Date.now() - clicked} ms)`)
      await toast(page, 'Настройки сохранены').waitFor({ timeout: budget })
      note(`${label}: save confirmed after ${Date.now() - clicked} ms`)
      if (label === 'Slow 3G') await shot(page, 'net-4-slow3g-saved')
      ok(true, `${label}: whole flow completes without stuck loading states`)
      await ctx.close()
    }

    // ── 8. Reduced motion and phone width ─────────────────────────────────────────────────────────────
    ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' })
    page = await ctx.newPage()
    await page.goto(BASE + '/')
    await page.getByRole('heading', { name: 'Вход' }).waitFor()
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.animate-enter')).animationDuration)
    ok(dur === '0.001s', `reduced motion: enter animations are disabled (${dur})`)
    await ctx.close()
    ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    page = await ctx.newPage()
    watch(page)
    await page.goto(BASE + '/')
    await page.getByRole('heading', { name: 'Вход' }).waitFor()
    await shot(page, 'mobile-1-login')
    await devLogin(page)
    await page.goto(BASE + '/settings')
    await page.getByText('Предпочтения').waitFor({ timeout: 30000 })
    await page.getByRole('button', { name: 'Dust2' }).tap()
    await page.getByRole('button', { name: 'Сохранить' }).tap()
    const tst = toast(page, 'Настройки сохранены')
    await tst.waitFor({ timeout: 10000 })
    const box = await tst.boundingBox()
    ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y > 56, 'mobile: toast fits the screen and stays clear of the header')
    await shot(page, 'mobile-2-toast')
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile: no horizontal scroll')
    await ctx.close()

    ok(errors.length === 0, `no uncaught page errors ${JSON.stringify(errors)}`)
    console.log(`\nALL UX CHECKS PASSED · screenshots: ${SHOTS}`)
  } catch (e) {
    console.error(e)
    if (page) await page.screenshot({ path: path.join(SHOTS, 'failure.png'), fullPage: true }).catch(() => {})
    console.error('artifacts in', DATA)
    process.exitCode = 1
  } finally {
    await browser.close()
    for (const p of Object.values(procs)) p.kill('SIGTERM')
  }
})()
