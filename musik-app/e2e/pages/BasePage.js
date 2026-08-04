export class BasePage {
  constructor(page) {
    this.page = page
  }

  async goto(path) {
    await this.page.goto(path)
  }

  async waitForSelector(selector, options = {}) {
    await this.page.waitForSelector(selector, options)
  }

  async waitForFunction(fn, options = {}) {
    await this.page.waitForFunction(fn, options)
  }
}
