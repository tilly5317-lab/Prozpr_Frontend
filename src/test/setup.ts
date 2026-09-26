import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Radix primitives (e.g. Slider) observe element size; jsdom lacks these.
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserverMock as unknown as typeof ResizeObserver);

// jsdom has no PointerEvent constructor. @testing-library/dom's fireEvent looks
// up `window[EventType]` and falls back to a bare Event when it is missing —
// and a bare Event drops clientX/pointerId, so every pointer-drag test in the
// suite would silently see `undefined`, not just one bar's.
class PointerEventPolyfill extends MouseEvent {
  public pointerId: number;
  public pointerType: string;
  constructor(type: string, params: PointerEventInit = {}) {
    super(type, params);
    this.pointerId = params.pointerId ?? 0;
    this.pointerType = params.pointerType ?? "mouse";
  }
}
globalThis.PointerEvent = globalThis.PointerEvent ?? (PointerEventPolyfill as unknown as typeof PointerEvent);
