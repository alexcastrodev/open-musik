import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('@inertiajs/react', () => ({
  usePage: vi.fn(),
  router: { reload: vi.fn() },
  Link: ({ href, children, onClick, ...props }) => {
    const React = require('react')
    return React.createElement('a', { href, onClick, ...props }, children)
  },
}))
