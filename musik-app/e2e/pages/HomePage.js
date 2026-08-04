import { BasePage } from "./BasePage.js"

export class HomePage extends BasePage {
  constructor(page) {
    super(page)
    this.songCards = page.locator('.song-card')
  }

  async goto() {
    await super.goto("/")
  }

  async songCount() {
    return this.songCards.count()
  }

  async clickFirstSong() {
    const first = this.songCards.first()
    const title = await first.locator('.song-title').textContent()
    await first.click()
    return title.trim()
  }

  async navigateToPlaylists() {
    // Try sidebar first (desktop), then mobile nav link
    const sidebar = this.page.locator('.sidebar-link', { hasText: 'Playlists' })
    if (await sidebar.isVisible()) {
      await sidebar.click()
      return
    }
    // Mobile: use the mobile-nav link (sidebar link is in DOM but hidden)
    const mobileLink = this.page.locator('.mobile-nav-link[href="/playlists"]')
    await mobileLink.click()
  }

  async navigateToHome() {
    const sidebar = this.page.locator('.sidebar-link', { hasText: 'Início' })
    if (await sidebar.isVisible()) {
      await sidebar.click()
      return
    }
    const mobileLink = this.page.locator('.mobile-nav-link[href="/songs"]')
    await mobileLink.click()
  }

  async sidebarPlaylistLinks() {
    return this.page.locator('.sidebar-playlist-link')
  }
}
