import { test, expect } from '@playwright/test'
import { mockAudio } from './helpers/audioMock.js'
import { HomePage } from './pages/HomePage.js'
import { PlaylistPage } from './pages/PlaylistPage.js'
import { PlayerPage } from './pages/PlayerPage.js'

test.describe('Playlist — player', () => {
  test.beforeEach(async ({ page }) => {
    await mockAudio(page)
  })

  test('Should play playlist when clicking play button and music was already playing from home', async ({ page }) => {
    const home = new HomePage(page)
    const playlist = new PlaylistPage(page)
    const player = new PlayerPage(page)

    // Start playing from home
    await home.goto()
    const homeSongCount = await home.songCount()
    if (homeSongCount === 0) test.skip(true, 'No songs on home page')

    await home.clickFirstSong()
    await expect(player.player).toHaveClass(/player-active/, { timeout: 4000 })

    // Navigate to first playlist via sidebar
    const navigated = await playlist.gotoFirst()
    if (!navigated) test.skip(true, 'No playlists in sidebar')
    await expect(page).toHaveURL(/playlists\/\d+/)

    const songCount = await playlist.songCount()
    if (songCount === 0) test.skip(true, 'Playlist has no songs')

    const firstTitle = await playlist.firstSongTitle()

    // Click "Tocar tudo"
    await playlist.clickPlayAll()

    // Player must update to the first playlist song
    await expect(player.title).toHaveText(firstTitle, { timeout: 4000 })
    await expect(player.loadingIcon).toBeHidden({ timeout: 4000 })
  })
})
