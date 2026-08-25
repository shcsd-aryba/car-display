import { screen } from 'electron'

// Dynamically load @nut-tree/nut-js — optional native dep.
// App still works (streaming only, no touch control) if unavailable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nutLib: any = null

try {
  nutLib = require('@nut-tree-fork/nut-js')
  nutLib.mouse.config.mouseSpeed = 9999 // instant movement, no animation
  console.log('[input] @nut-tree/nut-js loaded — touch control enabled')
} catch {
  console.warn('[input] @nut-tree/nut-js unavailable — touch control disabled')
}

// Bounds of the currently streamed source in absolute screen coordinates.
// Touches are mapped into this rect. Null = fall back to primary display.
let sourceBounds: { x: number; y: number; width: number; height: number } | null = null

export function setSourceBounds(b: typeof sourceBounds): void {
  sourceBounds = b
  if (b) console.log(`[input] source bounds: (${b.x},${b.y}) ${b.width}×${b.height}`)
}

// Find a window's screen bounds by matching its title to `name`.
// Uses nut-js v4 getWindows() / getBoundingBox(). Returns null if unavailable.
export async function findWindowBounds(
  name: string
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  if (!nutLib?.getWindows) return null
  try {
    const wins: { getTitle(): Promise<string>; getBoundingBox(): Promise<{ left: number; top: number; width: number; height: number }> }[] =
      await nutLib.getWindows()
    const nameLc = name.toLowerCase()
    for (const win of wins) {
      const title = await win.getTitle().catch(() => '')
      if (!title) continue
      const titleLc = title.toLowerCase()
      if (titleLc.includes(nameLc) || nameLc.includes(titleLc)) {
        const box = await win.getBoundingBox()
        return { x: box.left, y: box.top, width: box.width, height: box.height }
      }
    }
  } catch (e) {
    console.warn('[input] findWindowBounds failed:', e)
  }
  return null
}

export function isInputAvailable(): boolean {
  return nutLib !== null
}

function toPixel(normX: number, normY: number): unknown {
  const b = sourceBounds ?? screen.getPrimaryDisplay().bounds
  return new nutLib.Point(
    Math.round(b.x + normX * b.width),
    Math.round(b.y + normY * b.height)
  )
}

export type InputMessage =
  | { event: 'mousemove'; x: number; y: number }
  | { event: 'mousedown'; x: number; y: number; button: number }
  | { event: 'mouseup'; x: number; y: number; button: number }
  | { event: 'scroll'; deltaX: number; deltaY: number }

export function handleInput(msg: InputMessage): void {
  if (!nutLib) return
  const { mouse, Button, straightTo } = nutLib

  switch (msg.event) {
    case 'mousemove':
      mouse.move(straightTo(toPixel(msg.x, msg.y))).catch(console.error)
      break

    case 'mousedown':
      mouse
        .move(straightTo(toPixel(msg.x, msg.y)))
        .then(() => mouse.pressButton(msg.button === 2 ? Button.RIGHT : Button.LEFT))
        .catch(console.error)
      break

    case 'mouseup':
      mouse
        .move(straightTo(toPixel(msg.x, msg.y)))
        .then(() => mouse.releaseButton(msg.button === 2 ? Button.RIGHT : Button.LEFT))
        .catch(console.error)
      break

    case 'scroll': {
      const ticks = Math.max(1, Math.round(Math.abs(msg.deltaY) / 120))
      if (msg.deltaY > 0) mouse.scrollDown(ticks).catch(console.error)
      else mouse.scrollUp(ticks).catch(console.error)
      break
    }
  }
}
