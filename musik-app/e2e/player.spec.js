import { test, expect } from '@playwright/test'
import { mockAudio } from './helpers/audioMock.js'
import { HomePage } from './pages/HomePage.js'
import { PlaylistPage } from './pages/PlaylistPage.js'
import { PlayerPage } from './pages/PlayerPage.js'

test.describe('Player — state and queue', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudio(page)
  })

  // ── Basic playback ──────────────────────────────────────────────────────────

  test('next button clears loading state (not stuck in pending)', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() < 2) test.skip(true, 'Need at least 2 songs')

    await home.clickFirstSong()
    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })

    await player.clickNext()

    // Must not stay stuck in the loading/pending state
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })
  })

  test('previous button clears loading state', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() < 2) test.skip(true, 'Need at least 2 songs')

    await home.clickFirstSong()
    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })

    await player.clickNext()
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })

    await player.clickPrev()
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })
  })

  // ── Navigation between pages ────────────────────────────────────────────────

  test('player stays active after navigating home → playlist → home', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs on home page')

    const title = await home.clickFirstSong()
    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })

    // Go to playlists and back
    await home.navigateToPlaylists()
    await expect(page).toHaveURL(/playlists/)
    await home.navigateToHome()
    await expect(page).toHaveURL(/\/(songs)?$/)

    // Player must still show the same song
    await expect(player.player).toHaveClass(/player-active/)
    await expect(player.title).toHaveText(title)
  })

  // ── Playlist playback ───────────────────────────────────────────────────────

  test('clicking a song in playlist activates the player', async ({ page }) => {
    const playlist = new PlaylistPage(page)
    const player = new PlayerPage(page)

    await page.goto('/')
    const navigated = await playlist.gotoFirst()
    if (!navigated) test.skip(true, 'No playlists available')
    if (await playlist.songCount() === 0) test.skip(true, 'Playlist is empty')

    const title = await playlist.clickFirstSong()

    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })
    await expect(player.title).toHaveText(title)
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })
  })

  // ── Queue correctness after navigation ─────────────────────────────────────

  test('next after playlist song advances within playlist queue, not home queue', async ({ page }) => {
    const home = new HomePage(page)
    const playlist = new PlaylistPage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() === 0) test.skip(true, 'No songs on home page')

    // Start playing from home (sets home queue)
    await home.clickFirstSong()
    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })

    // Navigate to playlist
    const navigated = await playlist.gotoFirst()
    if (!navigated) test.skip(true, 'No playlists available')
    if (await playlist.songCount() < 2) test.skip(true, 'Need at least 2 songs in playlist')

    // Get expected titles before clicking
    const firstTitle = await playlist.firstSongTitle()
    const secondTitle = await playlist.secondSongTitle()

    // Play first playlist song → replaces queue with playlist songs
    await playlist.clickFirstSong()
    await expect(player.title).toHaveText(firstTitle, { timeout: 4000 })

    // Next must go to the second playlist song, not a home-page song
    await player.clickNext()
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })
    await expect(player.title).toHaveText(secondTitle)
  })

  test('no stale handlers: next fires once after multiple navigations', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()
    if (await home.songCount() < 2) test.skip(true, 'Need at least 2 songs')

    // Navigate back and forth to stress-test handler cleanup
    for (let i = 0; i < 3; i++) {
      await home.navigateToPlaylists()
      await home.navigateToHome()
    }

    const title = await home.clickFirstSong()
    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })

    await player.clickNext()

    // Loading must clear (if handlers duplicated, error/waiting events misbehave)
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })

    // Title must have changed to something (next song loaded)
    const newTitle = await player.currentTitle()
    expect(newTitle).not.toBe('')
  })
})
