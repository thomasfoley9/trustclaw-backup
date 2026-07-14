// Shared vitest setup. Runs for every test file (node and jsdom).
import "@testing-library/jest-dom/vitest";

// jsdom does not implement matchMedia; several UI components (and libraries
// they pull in) probe it. Only stub it when a window exists so node-env test
// files are untouched.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
