import { test, expect } from '@playwright/test'

const VIDEO_URL    = 'https://www.youtube.com/watch?v=5GDvOxvzxW8'
const PLAYLIST_URL = 'https://www.youtube.com/watch?v=vIdqWMSf75w&list=PLS1EBBHoNXYRatYNlfluVn9ook_pD7d7h'

// Mock the import API so tests don't run real downloads
async function mockImportApi(page, response = { import_id: 'test-abc123' }, status = 200) {
  await page.route('**/songs/import_youtube', route =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response)
    })
  )
}

// Mock the imports list refresh endpoint
async function mockImportsList(page, html = '') {
  await page.route('**/songs/imports', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: html })
  )
}

test.describe('Jobs page', () => {

  // ── Page structure ─────────────────────────────────────────────────────────

  test('page loads at /jobs', async ({ page }) => {
    await page.goto('/jobs')
    await expect(page).toHaveURL('/jobs')
    await expect(page.locator('h1')).toHaveText('Jobs')
  })

  test('does not appear in the sidebar navigation', async ({ page }) => {
    await page.goto('/jobs')
    const nav = page.locator('.sidebar-link')
    const texts = await nav.allTextContents()
    expect(texts.every(t => !t.toLowerCase().includes('jobs'))).toBe(true)
  })

  test('has a URL input and Importar button', async ({ page }) => {
    await page.goto('/jobs')
    await expect(page.locator('[data-youtube-import-target="input"]')).toBeVisible()
    await expect(page.locator('[data-youtube-import-target="submitBtn"]')).toBeVisible()
    await expect(page.locator('[data-youtube-import-target="submitBtn"]')).toContainText('Importar')
  })

  // ── Submission — video URL ─────────────────────────────────────────────────

  test('submitting a video URL clears the input immediately', async ({ page }) => {
    await mockImportApi(page)
    await mockImportsList(page)
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="input"]').fill(VIDEO_URL)
    await page.locator('[data-youtube-import-target="submitBtn"]').click()

    // Input cleared so user can queue another URL right away
    await expect(page.locator('[data-youtube-import-target="input"]')).toHaveValue('')
  })

  test('submitting a video URL POSTs the correct URL to the API', async ({ page }) => {
    await mockImportApi(page, { import_id: 'test-video' })
    await mockImportsList(page)
    await page.goto('/jobs')

    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('/songs/import_youtube') && req.method() === 'POST'
      ),
      page.locator('[data-youtube-import-target="input"]').fill(VIDEO_URL)
        .then(() => page.locator('[data-youtube-import-target="submitBtn"]').click())
    ])

    const body = JSON.parse(request.postData())
    expect(body.youtube_url).toBe(VIDEO_URL)
  })

  // ── Submission — playlist URL ──────────────────────────────────────────────

  test('submitting a playlist URL clears the input immediately', async ({ page }) => {
    await mockImportApi(page, { import_id: 'test-playlist' })
    await mockImportsList(page)
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="input"]').fill(PLAYLIST_URL)
    await page.locator('[data-youtube-import-target="submitBtn"]').click()

    await expect(page.locator('[data-youtube-import-target="input"]')).toHaveValue('')
  })

  test('submitting a playlist URL POSTs the correct URL to the API', async ({ page }) => {
    await mockImportApi(page, { import_id: 'test-playlist' })
    await mockImportsList(page)
    await page.goto('/jobs')

    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('/songs/import_youtube') && req.method() === 'POST'
      ),
      page.locator('[data-youtube-import-target="input"]').fill(PLAYLIST_URL)
        .then(() => page.locator('[data-youtube-import-target="submitBtn"]').click())
    ])

    const body = JSON.parse(request.postData())
    expect(body.youtube_url).toBe(PLAYLIST_URL)
  })

  // ── Error states ───────────────────────────────────────────────────────────

  test('API error response shows error status in form', async ({ page }) => {
    await mockImportApi(page, { error: 'Falha ao importar.' }, 422)
    // Block WebSocket so no real ActionCable broadcast can interfere
    await page.routeWebSocket(/.*/, ws => ws.close())
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="input"]').fill(VIDEO_URL)
    await page.locator('[data-youtube-import-target="submitBtn"]').click()

    // On error the status area becomes visible with error state
    const status = page.locator('[data-youtube-import-target="status"]')
    await expect(status).toBeVisible({ timeout: 3000 })
    await expect(status).toHaveAttribute('data-status', 'error')
    await expect(page.locator('[data-youtube-import-target="statusMsg"]')).not.toBeEmpty()
  })

  test('duplicate song shows error status from API', async ({ page }) => {
    await mockImportApi(page, { error: 'Essa música já foi importada.' }, 422)
    await mockImportsList(page)
    // Block WebSocket so no real ActionCable broadcast can interfere
    await page.routeWebSocket(/.*/, ws => ws.close())
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="input"]').fill(VIDEO_URL)
    await page.locator('[data-youtube-import-target="submitBtn"]').click()

    const status = page.locator('[data-youtube-import-target="status"]')
    await expect(status).toBeVisible({ timeout: 3000 })
    await expect(status).toHaveAttribute('data-status', 'error')
    await expect(page.locator('[data-youtube-import-target="statusMsg"]')).not.toBeEmpty()
  })

  // ── Form guard ─────────────────────────────────────────────────────────────

  test('empty input does not submit', async ({ page }) => {
    let called = false
    await page.route('**/songs/import_youtube', route => { called = true; route.continue() })
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="submitBtn"]').click()
    await page.waitForTimeout(300)
    expect(called).toBe(false)
  })

  // ── Button stays enabled (non-blocking queue) ──────────────────────────────

  test('submit button stays enabled after submit to allow queueing', async ({ page }) => {
    await mockImportApi(page, { import_id: 'test-queue' })
    await mockImportsList(page)
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="input"]').fill(VIDEO_URL)
    await page.locator('[data-youtube-import-target="submitBtn"]').click()

    // Button must remain enabled so user can submit another URL immediately
    await expect(page.locator('[data-youtube-import-target="submitBtn"]')).toBeEnabled()
  })

  // ── Edge cases — form guard ────────────────────────────────────────────────

  test('whitespace-only input does not submit', async ({ page }) => {
    let called = false
    await page.route('**/songs/import_youtube', route => { called = true; route.continue() })
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="input"]').fill('   ')
    await page.locator('[data-youtube-import-target="submitBtn"]').click()
    await page.waitForTimeout(300)
    expect(called).toBe(false)
  })

  test('submitting two URLs in sequence queues both', async ({ page }) => {
    let callCount = 0
    await page.route('**/songs/import_youtube', route => {
      callCount++
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ import_id: `id-${callCount}` }) })
    })
    await mockImportsList(page)
    await page.goto('/jobs')

    const input = page.locator('[data-youtube-import-target="input"]')
    const btn   = page.locator('[data-youtube-import-target="submitBtn"]')

    const [req1] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/songs/import_youtube') && r.method() === 'POST'),
      input.fill(VIDEO_URL).then(() => btn.click())
    ])
    await expect(input).toHaveValue('')

    const [req2] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/songs/import_youtube') && r.method() === 'POST'),
      input.fill(PLAYLIST_URL).then(() => btn.click())
    ])
    await expect(input).toHaveValue('')

    expect(JSON.parse(req1.postData()).youtube_url).toBe(VIDEO_URL)
    expect(JSON.parse(req2.postData()).youtube_url).toBe(PLAYLIST_URL)
  })

  // ── Edge cases — network failure ───────────────────────────────────────────

  test('network failure on import shows error status', async ({ page }) => {
    await page.route('**/songs/import_youtube', route => route.abort('failed'))
    await page.routeWebSocket(/.*/, ws => ws.close())
    await page.goto('/jobs')

    await page.locator('[data-youtube-import-target="input"]').fill(VIDEO_URL)
    await page.locator('[data-youtube-import-target="submitBtn"]').click()

    const status = page.locator('[data-youtube-import-target="status"]')
    await expect(status).toBeVisible({ timeout: 4000 })
    await expect(status).toHaveAttribute('data-status', 'error')
  })

  // ── Imports list ───────────────────────────────────────────────────────────

  test('recent imports list is shown on page load', async ({ page }) => {
    await page.goto('/jobs')
    // The wrapper always exists (may be empty if no imports yet)
    await expect(page.locator('#imports-list-wrapper')).toBeAttached()
  })
})
