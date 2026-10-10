import '@testing-library/jest-dom/vitest'
import 'dayjs/locale/ru'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom не реализует matchMedia, а Mantine вызывает его в use-provider-color-scheme
window.matchMedia = (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})

afterEach(cleanup)
