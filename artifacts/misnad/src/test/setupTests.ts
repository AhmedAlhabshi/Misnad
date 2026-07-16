import "@testing-library/jest-dom/vitest";

// jsdom has no DOMMatrix implementation. `pdfjs-dist` (imported by
// `ContractTab.tsx`, which `ResultsScreen.tsx` imports) references it at
// module-load time, so any test that touches `ResultsScreen` — even
// without ever rendering the Contract tab itself — fails at import unless
// something is defined. This is a minimal, test-only stub; it is never
// used for actual PDF rendering (real usage always runs in a real browser).
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error -- deliberately minimal; only needs to exist, not to be a real implementation.
  globalThis.DOMMatrix = class DOMMatrix {};
}

// jsdom does not implement `Element.scrollIntoView` at all — `ContractChat`
// calls it purely as a UX nicety (auto-scroll to the latest message), never
// as something a test needs to assert real scroll behavior from.
if (typeof window !== "undefined" && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom does not implement `window.scrollTo` — the V2 ResultsScreen calls it
// as a UX nicety (scroll to top on tab change), never as something a test
// needs to assert real scroll behavior from.
if (typeof window !== "undefined" && !window.scrollTo) {
  window.scrollTo = function scrollTo() {};
}
