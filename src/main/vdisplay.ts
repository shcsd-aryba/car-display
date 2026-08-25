/**
 * macOS virtual display via CGVirtualDisplayCreate (macOS 12.4+).
 *
 * Implemented as a native Node.js addon (native/vdisplay.mm) that loads
 * inside the Electron process. Electron is signed with a real Developer ID
 * cert, which allows dyld to expose CGVirtualDisplayCreate — a symbol that
 * is filtered out for unsigned / ad-hoc binaries by entitlement checking.
 *
 * The addon keeps the CGVirtualDisplay object alive in a C++ global for the
 * lifetime of the process, so no subprocess or run loop is needed.
 */

import { app } from 'electron'
import { join } from 'path'

interface VDisplayAddon {
  create(): number | null   // returns displayID (>0), negative error code, or null
  destroy(): void
}

// electron-rebuild puts the .node file next to the compiled main bundle
function loadAddon(): VDisplayAddon | null {
  const candidates = [
    // Development (electron-vite dev): out/main/ is the output dir
    join(__dirname, '../../build/Release/vdisplay.node'),
    join(__dirname, '../../../build/Release/vdisplay.node'),
    // Packaged app: extraResources places it next to the app resources
    join(process.resourcesPath, 'vdisplay.node'),
    join(__dirname, 'vdisplay.node')
  ]
  for (const p of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require(p) as VDisplayAddon
    } catch {
      // try next
    }
  }
  return null
}

let addon: VDisplayAddon | null = null

export async function startVirtualDisplay(): Promise<string | null> {
  if (process.platform !== 'darwin') return null

  if (!addon) addon = loadAddon()
  if (!addon) {
    console.warn('[vdisplay] Native addon not found — run: npm run build:addon')
    return null
  }

  try {
    const result = addon.create()
    if (result === null) {
      console.warn('[vdisplay] CGVirtualDisplayCreate not available (symbol not found)')
      return null
    }
    if (result < 0) {
      console.warn(`[vdisplay] CGVirtualDisplayCreate failed (error ${-result})`)
      return null
    }
    const displayId = String(result)
    console.log(`[vdisplay] Virtual monitor ready — displayID ${displayId}`)
    return displayId
  } catch (e) {
    console.warn('[vdisplay] addon.create() threw:', (e as Error).message)
    return null
  }
}

export function stopVirtualDisplay(): void {
  if (addon) {
    try { addon.destroy() } catch { /* ignore */ }
    console.log('[vdisplay] Virtual display released')
  }
}
