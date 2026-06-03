import { screen } from 'electron'

// Try to load robotjs — optional native dependency
let robot: {
  moveMouse(x: number, y: number): void
  mouseClick(button?: string, double?: boolean): void
  mouseToggle(down: string, button?: string): void
  scrollMouse(x: number, y: number): void
  keyTap(key: string, modifier?: string | string[]): void
} | null = null

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  robot = require('robotjs')
  console.log('[input] robotjs loaded — touch control enabled')
} catch {
  console.warn('[input] robotjs not available — touch control disabled')
}

export function isInputAvailable(): boolean {
  return robot !== null
}

export function injectMouseMove(normX: number, normY: number): void {
  if (!robot) return
  const { width, height } = screen.getPrimaryDisplay().bounds
  robot.moveMouse(Math.round(normX * width), Math.round(normY * height))
}

export function injectMouseDown(normX: number, normY: number, button: number): void {
  if (!robot) return
  const { width, height } = screen.getPrimaryDisplay().bounds
  robot.moveMouse(Math.round(normX * width), Math.round(normY * height))
  robot.mouseToggle('down', button === 2 ? 'right' : 'left')
}

export function injectMouseUp(normX: number, normY: number, button: number): void {
  if (!robot) return
  const { width, height } = screen.getPrimaryDisplay().bounds
  robot.moveMouse(Math.round(normX * width), Math.round(normY * height))
  robot.mouseToggle('up', button === 2 ? 'right' : 'left')
}

export function injectScroll(deltaX: number, deltaY: number): void {
  if (!robot) return
  robot.scrollMouse(
    Math.round(-deltaX / 120),
    Math.round(-deltaY / 120)
  )
}

export type InputMessage =
  | { event: 'mousemove'; x: number; y: number }
  | { event: 'mousedown'; x: number; y: number; button: number }
  | { event: 'mouseup'; x: number; y: number; button: number }
  | { event: 'scroll'; deltaX: number; deltaY: number }

export function handleInput(msg: InputMessage): void {
  switch (msg.event) {
    case 'mousemove':
      injectMouseMove(msg.x, msg.y)
      break
    case 'mousedown':
      injectMouseDown(msg.x, msg.y, msg.button)
      break
    case 'mouseup':
      injectMouseUp(msg.x, msg.y, msg.button)
      break
    case 'scroll':
      injectScroll(msg.deltaX, msg.deltaY)
      break
  }
}
