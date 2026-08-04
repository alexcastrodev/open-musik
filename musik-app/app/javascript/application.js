// Configure your import map in config/importmap.rb. Read more: https://github.com/rails/importmap-rails
import "@hotwired/turbo-rails"
import "controllers"

if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  document.addEventListener('DOMContentLoaded', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
