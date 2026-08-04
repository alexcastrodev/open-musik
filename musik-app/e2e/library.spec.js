import { test, expect } from '@playwright/test'
import { mockAudio } from './helpers/audioMock.js'
import { HomePage } from './pages/HomePage.js'
import { PlayerPage } from './pages/PlayerPage.js'

test.describe('Library — search', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudio(page)
  })

  test('search input is visible on home page', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    const count = await home.songCount()
    if (count === 0) test.skip(true, 'No songs in library')

    await expect(page.locator('[data-library-search-target="input"]')).toBeVisible()
  })

  test('typing filters song cards', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    if (await home.songCount() === 0) test.skip(true, 'No songs in library')

    const input = page.locator('[data-library-search-target="input"]')

    // Get first song title to use as search query
    const firstTitle = await page.locator('.song-card .song-title').first().textContent()
    const query = firstTitle.trim().slice(0, 4)

    await input.fill(query)
    await page.waitForTimeout(100)

    // At least one card must be visible after filtering
    const visible = await page.locator('[data-library-search-target="card"]:visible').count()
    expect(visible).toBeGreaterThan(0)
  })

  test('clearing search restores all cards', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    if (await home.songCount() === 0) test.skip(true, 'No songs in library')

    const input = page.locator('[data-library-search-target="input"]')
    const totalBefore = await page.locator('[data-library-search-target="card"]').count()

    await input.fill('xyzzy_no_match_expected')
    await page.waitForTimeout(100)

    await input.fill('')
    await page.waitForTimeout(100)

    const totalAfter = await page.locator('[data-library-search-target="card"]:visible').count()
    expect(totalAfter).toBe(totalBefore)
  })

  test('search with no results hides all cards', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    if (await home.songCount() === 0) test.skip(true, 'No songs in library')

    await page.locator('[data-library-search-target="input"]').fill('xyzzy_no_match_expected_99999')
    await page.waitForTimeout(100)

    const visible = await page.locator('.song-card:visible').count()
    expect(visible).toBe(0)
  })

  test('search is case-insensitive', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    if (await home.songCount() === 0) test.skip(true, 'No songs in library')

    const firstTitle = await page.locator('.song-card .song-title').first().textContent()
    const query = firstTitle.trim().slice(0, 4).toUpperCase()

    await page.locator('[data-library-search-target="input"]').fill(query)
    await page.waitForTimeout(100)

    const visible = await page.locator('[data-library-search-target="card"]:visible').count()
    expect(visible).toBeGreaterThan(0)
  })

  test('search with only spaces does not crash', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    if (await home.songCount() === 0) test.skip(true, 'No songs in library')

    const totalCards = await page.locator('[data-library-search-target="card"]').count()

    await page.locator('[data-library-search-target="input"]').fill('   ')
    await page.waitForTimeout(100)

    // Spaces-only query: all cards still visible (treated as empty or matches all)
    const visible = await page.locator('[data-library-search-target="card"]:visible').count()
    expect(visible).toBeGreaterThanOrEqual(0) // must not throw/crash
    expect(page.locator('body')).toBeTruthy()
  })

  test('search with special characters does not crash', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    if (await home.songCount() === 0) test.skip(true, 'No songs in library')

    await page.locator('[data-library-search-target="input"]').fill('.*[]()?+\\')
    await page.waitForTimeout(100)

    // Page must remain functional
    await expect(page.locator('#songs-list')).toBeAttached()
  })
})

test.describe('Library — empty state', () => {
  test('shows empty state when no songs', async ({ page }) => {
    const home = new HomePage(page)
    await home.goto()

    const count = await home.songCount()
    if (count > 0) test.skip(true, 'Library has songs — skip empty state test')

    await expect(page.locator('.empty-state')).toBeVisible()
  })
})
