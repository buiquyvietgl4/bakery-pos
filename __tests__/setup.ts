import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock cho các API trình duyệt không có trong jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock AudioContext cho audioAlert tests
Object.defineProperty(window, 'AudioContext', {
  writable: true,
  value: class MockAudioContext {
    createOscillator() { return { connect: () => {}, start: () => {}, stop: () => {}, frequency: { value: 0 } } }
    createGain() { return { connect: () => {}, gain: { value: 0 } } }
    get destination() { return {} }
    close() {}
  }
})

// Mock IndexedDB / Dexie - sẽ mock cụ thể trong từng test file
vi.mock('dexie', () => ({
  default: class MockDexie {
    version() { return { stores: () => this } }
  }
}))
