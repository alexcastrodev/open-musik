import { BasePage } from "./BasePage.js"

export class PlaylistPage extends BasePage {
  constructor(page) {
    super(page)
    this.rows = page.locator('.table-row')
    this.playAllBtn = page.locator('button', { hasText: 'Tocar tudo' })
  }

  async goto() {
    await super.goto("/playlists")
  }

  async gotoFirst() {
    // On desktop use sidebar links; on mobile navigate to /playlists and pick first card
    const sidebarLinks = this.page.locator('.sidebar-playlist-link')
    if (await sidebarLinks.first().isVisible()) {
      const count = await sidebarLinks.count()
      if (count === 0) return false
      await sidebarLinks.first().click()
      return true
    }
    // Mobile: go to playlists index and click first card
    await this.page.goto('/playlists')
    const cards = this.page.locator('.playlist-card-link')
    if (await cards.count() === 0) return false
    await cards.first().click()
    return true
  }

  async songCount() {
    return this.rows.count()
  }

  async clickFirstSong() {
    const first = this.rows.first()
    const title = await first.locator('.table-title').textContent()
    await first.click()
    return title.trim()
  }

  async clickPlayAll() {
    await this.playAllBtn.click()
  }

  async firstSongTitle() {
    return (await this.rows.first().locator('.table-title').textContent()).trim()
  }

  async secondSongTitle() {
    return (await this.rows.nth(1).locator('.table-title').textContent()).trim()
  }
}
