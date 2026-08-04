import { expect } from '@playwright/test'

export class PlayerPage {
  constructor(page) {
    this.page        = page
    this.player      = page.locator('#player')
    this.title       = page.locator('[data-player-target="title"]')
    this.artist      = page.locator('[data-player-target="artist"]')
    this.loadingIcon = page.locator('[data-player-target="loadingIcon"]')
    this.playIcon    = page.locator('[data-player-target="playIcon"]')
    this.pauseIcon   = page.locator('[data-player-target="pauseIcon"]')
    this.nextBtn     = page.locator('.player-btn-next')
    this.prevBtn     = page.locator('.player-btn-prev')
    this.playBtn     = page.locator('.player-play-btn').first()
  }

  async isActive() {
    return this.player.evaluate(el => el.classList.contains('player-active'))
  }

  async waitForActive(timeout = 4000) {
    await expect(this.player).toHaveClass(/player-active/, { timeout })
  }

  async waitForNotLoading(timeout = 4000) {
    await expect(this.loadingIcon).toBeHidden({ timeout })
  }

  async currentTitle() {
    return (await this.title.textContent()).trim()
  }

  // On mobile next/prev/queue are hidden in the mini-bar — open expanded player first
  async isMobile() {
    return !(await this.nextBtn.isVisible())
  }

  async openExpanded() {
    const expanded = this.page.locator('#player-expanded')
    if (await expanded.isVisible()) return
    await this.page.locator('.player-track').click()
    await expect(expanded).toBeVisible({ timeout: 3000 })
    await this.page.waitForTimeout(350) // allow open animation to settle
  }

  async clickNext() {
    if (await this.nextBtn.isVisible()) {
      await this.nextBtn.click()
    } else {
      // On mobile the mini-bar next btn is hidden — dispatch click directly to avoid
      // needing the expanded overlay (WebKit headless animation can block it)
      await this.page.locator('.player-btn-next').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    }
  }

  async clickPrev() {
    if (await this.prevBtn.isVisible()) {
      await this.prevBtn.click()
    } else {
      await this.page.locator('.player-btn-prev').evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    }
  }
}
