/* Phase II browser E2E against the MOCK stack (scripts/run_mock_stack.sh): sign-in screen for anonymous users, no demo
 * datasets, test-only login, player page, Match Scout from a matchroom URL, feedback, prediction snapshot,
 * match finish (mock admin) -> outcome, settings persistence, coach goal, demo upload -> tactical evidence.
 * Usage: node scripts/e2e_phase2.cjs [baseUrl] [mockUrl] [demoPath] */
const { chromium } = require('playwright')
const path = require('path')

const BASE = process.argv[2] || 'http://localhost:8000'
const MOCK = process.argv[3] || 'http://127.0.0.1:8901'
const DEMO = process.argv[4] || path.join(__dirname, '..', 'samples', 'test_demo_mirage.dem')
const ok = (c, m) => {
  if (!c) throw new Error('FAILED: ' + m)
  console.log('ok -', m)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/40[19]|503/.test(m.text()) && errors.push(m.text()))
  const up = await (await fetch(`${MOCK}/admin/upcoming`)).json()

  await page.goto(BASE + '/')
  await page.getByRole('heading', { name: 'Вход' }).waitFor()
  const body = await page.textContent('body')
  ok(!/sim_player|Синтетика|synthetic/i.test(body), 'no synthetic datasets/accounts in the production UI')
  ok(await page.getByText('Войти через Steam').isVisible(), 'Steam login offered to anonymous users')

  // test-only login (enabled only on localhost with AUTH_DEV_LOGIN)
  await page.evaluate(async () => {
    await fetch('/api/auth/dev-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faceit_nickname: 'scout_me' }) })
  })
  await page.goto(BASE + '/')
  await page.getByText('Ваш профиль').waitFor()
  ok(await page.getByText('scout_me').first().isVisible(), 'dashboard detects own FACEIT profile')

  await page.goto(BASE + '/players/scout_me')
  await page.getByText('Win rate').first().waitFor()
  ok(await page.getByText('FACEIT API').first().isVisible(), 'player page uses FACEIT API source')

  await page.goto(BASE + '/scout')
  await page.getByLabel('Ссылка на комнату матча FACEIT').fill(`https://www.faceit.com/ru/cs2/room/${up.match_id}`)
  await page.getByRole('button', { name: 'Разведка' }).click()
  await page.waitForURL(/\/scout\/[0-9a-f]{12}/)
  await page.getByText('Предматчевый брифинг').waitFor({ timeout: 90000 })
  const scoutUrl = page.url()
  ok((await page.locator('text=угроза').count()) >= 10, 'both rosters rendered with threat ranks (10 players)')
  ok(await page.getByText('Необычно сильный новый аккаунт').first().isVisible(), 'planted anomalous profile is flagged with explanation')
  ok(await page.getByText('Снимок прогноза зафиксирован').isVisible(), 'prediction snapshot stored before the match')
  await page.getByRole('button', { name: 'Вывод подтвердился (ваш отзыв)' }).first().click()
  await page.waitForTimeout(500)
  ok((await page.locator('[aria-pressed="true"]').count()) >= 1, 'feedback stored for a briefing item')

  // match finishes -> resolve outcome
  await fetch(`${MOCK}/admin/finish/${up.match_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ winner: 'faction2' }) })
  await page.waitForTimeout(21000) // live-match cache TTL (20 s)
  await page.goto(BASE + '/predictions')
  await page.getByRole('button', { name: 'Проверить завершённые матчи' }).click()
  await page.getByText(/Проверено \d+, закрыто 1/).waitFor({ timeout: 30000 })
  ok(await page.getByText('угадан').first().isVisible(), 'prediction compared with the real outcome')
  await page.goto(scoutUrl)
  await page.getByText(/Победила/).first().waitFor()
  ok(true, 'scout report shows outcome next to the frozen prediction')

  await page.goto(BASE + '/settings')
  await page.getByRole('button', { name: 'Mirage' }).click()
  await page.getByRole('button', { name: 'Сохранить' }).click()
  await page.getByText('Сохранено').waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Mirage' }).waitFor()
  ok((await page.getByRole('button', { name: 'Mirage' }).getAttribute('aria-pressed')) === 'true', 'user settings persist')

  await page.goto(BASE + '/coach')
  await page.getByText('Форма по неделям').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Поставить цель' }).click()
  await page.getByText(/база .* → цель/).first().waitFor()
  ok(true, 'coaching goal created with frozen baseline')

  await page.goto(BASE + '/demos')
  await page.locator('input[type=file]').setInputFiles(DEMO)
  await page.waitForURL(/demos\/[0-9a-f]{12}/, { timeout: 120000 })
  await page.getByText('Таймлайн раундов').waitFor({ timeout: 120000 })
  ok(true, 'existing demo analyzer still works')

  ok(errors.length === 0, 'no console/page errors ' + JSON.stringify(errors))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
