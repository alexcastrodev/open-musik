import { test, expect } from '@playwright/test'
import { mockAudio } from './helpers/audioMock.js'
import { HomePage } from './pages/HomePage.js'
import { PlayerPage } from './pages/PlayerPage.js'

test.describe('Home page — player', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudio(page)
  })

  test('Should start music when clicking music card', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()

    const count = await home.songCount()
    if (count === 0) test.skip(true, 'No songs available')

    const expectedTitle = await home.clickFirstSong()

    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })
    await expect(player.title).toHaveText(expectedTitle)
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })
  })

  test('Should keep playing music when navigating between pages', async ({ page }) => {
    const home = new HomePage(page)
    const player = new PlayerPage(page)

    await home.goto()

    const count = await home.songCount()
    if (count === 0) test.skip(true, 'No songs available')

    const expectedTitle = await home.clickFirstSong()
    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })

    // Navigate away to playlists
    await home.navigateToPlaylists()
    await expect(page).toHaveURL(/playlists/)

    // Player must remain active with the same song
    await expect(player.player).toHaveClass(/player-active/)
    await expect(player.title).toHaveText(expectedTitle)
    await expect(player.loadingIcon).toBeHidden()
  })
})
