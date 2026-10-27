/* End-to-end smoke test against a running app (backend serving frontend/dist on :8000).
 * Usage: node scripts/e2e_smoke.cjs [baseUrl] [path/to/demo.dem]
 * Requires Playwright with Chromium (npm i -g playwright && npx playwright install chromium). */
const { chromium } = require('playwright')
const path = require('path')

const BASE = process.argv[2] || 'http://localhost:8000'
const DEMO = process.argv[3] || path.join(__dirname, '..', 'samples', 'test_demo_mirage.dem')

function check(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg)
  console.log('ok -', msg)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  // 1. search a player from the home page
  await page.goto(BASE + '/')
  await page.getByRole('searchbox').or(page.getByLabel('Никнейм FACEIT')).first().fill('limelightttt')
  await page.getByRole('button', { name: 'Анализ' }).first().click()
  await page.waitForURL(/players\/limelightttt/)
  await page.getByText('Win rate').first().waitFor()
  check(await page.getByText('Реальный снимок').first().isVisible(), 'real snapshot player loads with source badge')

  // 2. open a match from the table
  await page.locator('tbody tr').first().click()
  await page.waitForURL(/matches\/1-/)
  await page.getByText('Rating 1.0').first().waitFor()
  check((await page.locator('table').count()) === 2, 'match detail shows two team scoreboards')

  // 3. tabs on the synthetic dataset
  for (const [tab, marker] of [
    ['Elo', 'Траектория Elo'],
    ['Матчмейкинг', 'Гипотеза «скрытого пула»'],
    ['Сильные стороны', 'Методика'],
    ['Лучшие / худшие', 'Чем отличаются'],
  ]) {
    await page.goto(BASE + '/players/sim_player?limit=50')
    await page.getByRole('link', { name: tab, exact: true }).click()
    await page.getByText(marker).first().waitFor({ timeout: 15000 })
    check(true, `tab "${tab}" renders`)
  }

  // 4. upload a real demo through the UI and wait for the analysis
  await page.goto(BASE + '/demos')
  await page.locator('input[type=file]').setInputFiles(DEMO)
  await page.waitForURL(/demos\/[0-9a-f]{12}/, { timeout: 120000 })
  await page.getByText('Таймлайн раундов').waitFor({ timeout: 120000 })
  check(true, 'uploaded demo parsed and analysis page rendered')

  // 5. a highlight jumps to its round
  const card = page.locator('[role=button]', { hasText: 'Раунд' }).first()
  const roundText = await card.getByText(/Раунд \d+/).first().innerText()
  const n = roundText.match(/Раунд (\d+)/)[1]
  await card.click()
  await page.waitForURL(new RegExp(`round=${n}`))
  check(await page.getByText(new RegExp(`^Раунд ${n} ·`)).first().isVisible(), `highlight opens round ${n}`)

  // 6. timeline click selects a round
  await page.getByRole('button', { name: 'Раунд 3', exact: true }).click()
  await page.waitForURL(/round=3/)
  check(true, 'timeline selects round 3')

  check(errors.length === 0, 'no console/page errors ' + JSON.stringify(errors))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
