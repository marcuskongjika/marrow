/**
 * Scroll offsets, remembered per document path for the lifetime of the window.
 *
 * Deliberately not React state: restoring on a tab switch and preserving the
 * position across a live reload become the same one-liner, and scrolling never
 * triggers a re-render.
 */

const offsets = new Map<string, number>()

export function rememberScroll(path: string, top: number): void {
  offsets.set(path, top)
}

export function recallScroll(path: string): number {
  return offsets.get(path) ?? 0
}

export function forgetScroll(path: string): void {
  offsets.delete(path)
}
