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

export function isInputAvailable(): boolean {
  return nutLib !== null
}

function toPixel(normX: number, normY: number): unknown {
  const { width, height } = screen.getPrimaryDisplay().bounds
  return new nutLib.Point(Math.round(normX * width), Math.round(normY * height))
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
