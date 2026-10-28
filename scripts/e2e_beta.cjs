/* Private-beta browser E2E (Playwright). Self-contained: starts the MOCK FACEIT API and the app (with the
 * built frontend) in a fresh data dir, restarts the app mid-test and stops the mock to simulate an outage.
 * Everything runs against simulated FACEIT data and the test-only login — NOT a live FACEIT/Steam check.
 * Usage: node scripts/e2e_beta.cjs            (requires: backend deps via uv, frontend built, Playwright)  */
const { chromium } = require('playwright')
const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const BASE = 'http://localhost:8010'
const MOCK = 'http://127.0.0.1:8911'
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'fi-e2e-'))
const DEMO = path.join(ROOT, 'samples', 'test_demo_mirage.dem')
const procs = {}
let page
const ok = (c, m) => {
  if (!c) throw new Error('FAILED: ' + m)
  console.log('ok -', m)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
function stop(name) {
  return new Promise((resolve) => {
    const p = procs[name]
    if (!p || p.exitCode !== null) return resolve()
    p.on('exit', () => resolve())
    p.kill('SIGTERM')
  })
}
const startMock = () => start('mock', ['python', '-m', 'tests.support.mock_faceit', '--port', '8911'])
const startApp = () =>
  start('app', ['uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8010'], {
    FACEIT_API_BASE: `${MOCK}/data/v4`, FACEIT_API_KEY: 'test-key', FACEIT_REQUESTS_PER_SECOND: '50',
    AUTH_DEV_LOGIN: 'true', DATA_DIR: DATA, APP_BASE_URL: BASE, REQUIRE_LOGIN: 'true', TRACKING_INTERVAL_MINUTES: '0',
    CORS_ORIGINS: JSON.stringify([BASE]),
  })

;(async () => {
  startMock()
  startApp()
  await waitUrl(`${MOCK}/admin/upcoming`)
  await waitUrl(`${BASE}/api/health`)
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const up = await (await fetch(`${MOCK}/admin/upcoming`)).json()

  // 1-2. new user sees a clear sign-in screen (data endpoints closed)
  await page.goto(BASE + '/players/scout_me')
  await page.getByRole('heading', { name: 'Вход' }).waitFor()
  ok(await page.getByText('by limelightttt').first().isVisible(), 'sign-in screen with FACEIT Intelligence by limelightttt branding')
  ok(await page.getByRole('link', { name: 'Войти через Steam' }).isVisible(), 'Steam sign-in offered')
  ok((await fetch(`${BASE}/api/players/scout_me/overview`)).status === 401, 'API refuses anonymous data access')
  await page.goto(BASE + '/?auth_error=' + encodeURIComponent('Сессия входа устарела'))
  await page.getByRole('alert').getByText('Сессия входа устарела').waitFor({ timeout: 15000 })
  ok(true, 'auth callback errors are shown on the sign-in screen')

  // 3-4. sign in (test-only provider) -> own profile detected
  await page.evaluate(async () => {
    await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faceit_nickname: 'scout_me' }) })
  })
  await page.goto(BASE + '/')
  await page.getByText('Ваш профиль').waitFor({ timeout: 60000 })
  ok(await page.getByRole('link', { name: 'scout_me' }).first().isVisible(), 'dashboard shows the own FACEIT profile without searching')

  // 5-7. search another player, profile, match history
  await page.getByLabel('Никнейм FACEIT').first().fill('duo_a')
  await page.getByRole('button', { name: 'Анализ' }).first().click().catch(() => {})
  await page.goto(BASE + '/players/duo_a')
  await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
  await page.getByRole('link', { name: 'Матчи', exact: true }).click()
  await page.getByText('История матчей').waitFor()
  ok((await page.locator('tbody tr').count()) >= 10, 'other player profile and match history load')

  // 8-10. Match Scout from a matchroom URL + saved prediction
  await page.goto(BASE + '/scout')
  await page.getByLabel('Ссылка на комнату матча FACEIT').fill(`https://www.faceit.com/en/cs2/room/${up.match_id}`)
  await page.getByRole('button', { name: 'Разведка' }).click()
  await page.waitForURL(/\/scout\/[0-9a-f]{12}$/, { timeout: 30000 })
  await page.locator('text=угроза').nth(9).waitFor({ timeout: 120000 })
  const scoutUrl = page.url()
  ok((await page.locator('text=угроза').count()) >= 10, 'full scout: 10 players with threat cards')
  ok(await page.getByText('Снимок прогноза зафиксирован').isVisible(), 'prediction snapshot saved')
  await page.goto(BASE + '/settings')
  await page.getByRole('button', { name: 'Nuke' }).click()
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await page.getByText('Сохранено', { exact: true }).waitFor()

  // 11-12. restart the app: session, settings, scout and prediction survive
  await stop('app')
  startApp()
  await waitUrl(`${BASE}/api/health`)
  await page.goto(BASE + '/settings')
  await page.getByRole('button', { name: 'Nuke' }).waitFor({ timeout: 30000 })
  ok((await page.getByRole('button', { name: 'Nuke' }).getAttribute('aria-pressed')) === 'true', 'after restart: still signed in, settings kept')
  await page.goto(scoutUrl)
  await page.getByText('Снимок прогноза зафиксирован').waitFor({ timeout: 30000 })
  ok(true, 'after restart: scout report and prediction still available')
  await page.goto(BASE + '/predictions')
  await page.getByText('Все прогнозы').waitFor()
  ok((await page.locator('tbody tr').count()) === 1, 'after restart: exactly one prediction (no duplicates)')

  // API outage: uncached player -> readable error, cached data still works
  await stop('mock')
  await page.goto(BASE + '/players/enemy_c')
  await page.getByText('FACEIT временно недоступен').waitFor({ timeout: 90000 })
  ok(await page.getByText(/FACEIT/).first().isVisible(), 'FACEIT outage shows a readable error (no fake data)')
  await page.goto(BASE + '/players/duo_a')
  await page.getByText('Win rate').first().waitFor({ timeout: 60000 })
  ok(true, 'previously loaded player still served from cache during the outage')
  startMock()
  await waitUrl(`${MOCK}/admin/upcoming`)

  // demo upload still works; duplicate upload is recognized
  await page.goto(BASE + '/demos')
  await page.locator('input[type=file]').setInputFiles(DEMO)
  await page.waitForURL(/demos\/[0-9a-f]{12}/, { timeout: 120000 })
  await page.getByText('Таймлайн раундов').waitFor({ timeout: 120000 })
  const firstDemo = page.url()
  await page.goto(BASE + '/demos')
  await page.locator('input[type=file]').setInputFiles(DEMO)
  await page.waitForURL(/demos\/[0-9a-f]{12}/, { timeout: 60000 })
  ok(page.url() === firstDemo, 'same demo uploaded twice opens the existing analysis (no duplicate)')

  // logout
  await page.goto(BASE + '/settings')
  await page.getByRole('button', { name: 'Выйти' }).click()
  await page.getByRole('heading', { name: 'Вход' }).waitFor({ timeout: 30000 })
  ok((await (await page.request.get(`${BASE}/api/auth/me`)).json()).authenticated === false, 'logout ends the session')

  // mobile layout of the key screens
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + '/')
  ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 390, 'sign-in screen fits a phone (no horizontal scroll)')

  ok(errors.length === 0, 'no uncaught page errors ' + JSON.stringify(errors))
  await browser.close()
})()
  .catch(async (e) => {
    console.error(e)
    if (page) await page.screenshot({ path: path.join(DATA, 'failure.png'), fullPage: true }).catch(() => {})
    console.error('artifacts in', DATA)
    process.exitCode = 1
  })
  .finally(async () => {
    await stop('app')
    await stop('mock')
  })
