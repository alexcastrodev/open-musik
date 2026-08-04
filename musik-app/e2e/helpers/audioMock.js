/**
 * Mocks HTMLMediaElement.play() so tests don't require real audio files
 * or a reachable S3/SeaweedFS server. The mock fires the 'playing' event
 * so the player controller exits its loading state correctly.
 */
export async function mockAudio(page) {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      const el = this
      setTimeout(() => el.dispatchEvent(new Event('playing')), 40)
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function () {
      this.dispatchEvent(new Event('pause'))
    }
  })
}
