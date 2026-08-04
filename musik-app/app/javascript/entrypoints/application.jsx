import React from 'react'
import './application.css'
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import Layout from '../components/Layout'

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('../pages/**/*.jsx', { eager: true })
    const page = pages[`../pages/${name}.jsx`]
    if (!page) throw new Error(`Page not found: ${name}. Available: ${Object.keys(pages).join(', ')}`)
    // layout === null significa sem layout (ex: Login); undefined significa usar o default
    if (page.default.layout === undefined) {
      page.default.layout = (children) => <Layout>{children}</Layout>
    }
    return page
  },
  setup({ el, App, props }) {
    console.log('[inertia setup]', { el, App: !!App, props: !!props })
    if (!el) { console.error('[inertia] el is null!'); return }
    createRoot(el).render(<App {...props} />)
  },
}).catch((e) => {
  console.error('Inertia init error:', e?.message, e?.stack)
  const app = document.getElementById('app')
  if (app) app.innerHTML = `<pre style="color:red;padding:20px">${e?.message}\n${e?.stack}</pre>`
})
