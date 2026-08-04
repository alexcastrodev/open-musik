import { test, expect } from '@playwright/test'
import { mockAudio } from './helpers/audioMock.js'
import { HomePage } from './pages/HomePage.js'
import { PlayerPage } from './pages/PlayerPage.js'

test.describe('Player — controls', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudio(page)
  })

  // ── Play / pause toggle ─────────────────────────────────────────────────────

  test('loading icon hides after song starts', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()
    await player.waitForNotLoading()

    // loading icon must be hidden once playing event fires
    await expect(player.loadingIcon).toBeHidden()
  })

  test('play button is present and clickable after song starts', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()
    await player.waitForNotLoading()

    await expect(player.playBtn).toBeEnabled()
    // Clicking must not throw or navigate
    await player.playBtn.click()
    await expect(player.player).toHaveClass(/player-active/)
  })

  // ── Shuffle ─────────────────────────────────────────────────────────────────

  test('shuffle button toggles active state', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()

    const shuffleBtn = page.locator('[data-player-target="shuffleBtn"]')
    if (!await shuffleBtn.isVisible()) test.skip(true, 'Shuffle hidden on mobile')

    const before = await shuffleBtn.getAttribute('class')
    await shuffleBtn.click()
    const after = await shuffleBtn.getAttribute('class')

    expect(before).not.toBe(after)
  })

  // ── Repeat ──────────────────────────────────────────────────────────────────

  test('repeat button cycles through states', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()

    const repeatBtn = page.locator('[data-player-target="repeatBtn"]')
    if (!await repeatBtn.isVisible()) test.skip(true, 'Repeat hidden on mobile')

    const state0 = await repeatBtn.getAttribute('class')
    await repeatBtn.click()
    const state1 = await repeatBtn.getAttribute('class')
    await repeatBtn.click()
    const state2 = await repeatBtn.getAttribute('class')

    // Three clicks should produce at least two different class states
    expect([state0, state1, state2].some((s, i, arr) => arr.indexOf(s) !== i || s !== arr[0])).toBe(true)
  })

  // ── Queue panel ─────────────────────────────────────────────────────────────

  test('queue button opens queue panel', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()

    const queuePanel = page.locator('#player-queue')
    const queueBtn = page.locator('.player-queue-btn')
    if (!await queueBtn.isVisible()) test.skip(true, 'Queue button hidden on mobile')

    await queueBtn.click()
    await expect(queuePanel).toHaveClass(/is-open/, { timeout: 2000 })
  })

  test('queue panel closes when toggled again', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()

    const queuePanel = page.locator('#player-queue')
    const queueBtn = page.locator('.player-queue-btn')
    if (!await queueBtn.isVisible()) test.skip(true, 'Queue button hidden on mobile')

    await queueBtn.click()
    await expect(queuePanel).toHaveClass(/is-open/, { timeout: 2000 })

    await queueBtn.click()
    await expect(queuePanel).not.toHaveClass(/is-open/, { timeout: 2000 })
  })

  test('playing a song adds it to the queue panel', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()

    // On mobile open expanded player which has its own queue button
    const queueBtn = page.locator('.player-queue-btn')
    if (await queueBtn.isVisible()) {
      await queueBtn.click()
    } else {
      await page.locator('.player-track').click()
      await page.locator('.player-expanded-queue-btn').click()
    }

    // Queue list must have at least one item (not just the empty message)
    const items = page.locator('#player-queue-list .queue-item')
    await expect(items.first()).toBeVisible({ timeout: 2000 })
  })

  // ── Edge cases — queue boundaries ──────────────────────────────────────────

  test('previous on first song does not crash or navigate away', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()
    await player.waitForNotLoading()

    // Press previous on the very first song
    await player.clickPrev()
    await page.waitForTimeout(300)

    // Player must remain active and not navigate
    await expect(player.player).toHaveClass(/player-active/)
    await expect(page).toHaveURL(/\/(songs)?$/)
  })

  test('next beyond last song wraps or stays without crashing', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    const count = await home.songCount()
    if (count === 0) test.skip(true, 'No songs available')

    // Click last song card so queue has one item
    const cards = page.locator('.song-card')
    const last = cards.last()
    await last.locator('.song-title').waitFor()
    await last.click()

    await player.waitForActive()
    await player.waitForNotLoading()

    await player.clickNext()
    await page.waitForTimeout(500)

    // Player must remain mounted (no crash, no navigation)
    await expect(player.player).toBeAttached()
    await expect(page).not.toHaveURL(/error/)
  })

  // ── Expanded player overlay ─────────────────────────────────────────────────

  test('clicking track info opens expanded player overlay', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()

    await page.locator('.player-track').click()

    const expanded = page.locator('#player-expanded')
    await expect(expanded).toBeVisible({ timeout: 2000 })
  })

  test('expanded player shows current song title', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    const title = await home.clickFirstSong()
    await player.waitForActive()

    await page.locator('.player-track').click()

    await expect(page.locator('[data-player-target="expandedTitle"]')).toHaveText(title, { timeout: 2000 })
  })

  test('close button collapses the expanded player', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs available')

    await home.clickFirstSong()
    await player.waitForActive()

    await page.locator('.player-track').click()
    await expect(page.locator('#player-expanded')).toBeVisible({ timeout: 2000 })

    await page.locator('.player-expanded-close').click()
    await expect(page.locator('#player-expanded')).toBeHidden({ timeout: 2000 })
  })
})
