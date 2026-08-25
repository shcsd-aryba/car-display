/**
 * macOS virtual display helper.
 * Compiles and spawns a Swift binary that calls CGVirtualDisplayCreate,
 * which registers a real monitor with the OS (macOS 12.4+).
 * The virtual display stays alive as long as this process runs.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, chmodSync } from 'fs'
import { execFile, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Swift source embedded here so no external resource file is needed.
const SWIFT_SOURCE = `
import Foundation
import CoreGraphics

// CGVirtualDisplay is public API since macOS 12.4 (CoreGraphics framework).
// The virtual display exists as long as this process runs.

if #available(macOS 12.4, *) {
    let desc = CGVirtualDisplayDescriptor()
    desc.name = "SideDisplay"
    desc.pixelSize          = CGSize(width: 1920, height: 1080)
    desc.sizeInMillimeters  = CGSize(width: 530,  height: 300)   // ~24" equiv.
    desc.maximumFramesPerSecond = 60
    desc.productID = 0xCA71
    desc.vendorID  = 0xCA71
    desc.serialNum = 1

    var vd:     CGVirtualDisplay?
    var stream: CGDisplayStream?

    let err = CGVirtualDisplayCreate(desc, &vd, &stream)
    guard err == .success, let display = vd else {
        fputs("[vdisplay] CGVirtualDisplayCreate failed (\\(err.rawValue))\\n", stderr)
        exit(Int32(err.rawValue == 0 ? 1 : err.rawValue))
    }

    // Emit displayID so the parent knows it's ready
    print("\\(display.displayID)")
    fflush(stdout)

    // Keep the run loop alive — display disappears when process exits
    RunLoop.main.run()
} else {
    fputs("[vdisplay] CGVirtualDisplay requires macOS 12.4+\\n", stderr)
    exit(1)
}
`

let vdProc: ChildProcess | null = null

function binaryPath(): string {
  return join(app.getPath('userData'), 'SideDisplay-vdisplay')
}

function sourcePath(): string {
  return join(app.getPath('userData'), 'SideDisplay-vdisplay.swift')
}

async function ensureCompiled(): Promise<boolean> {
  const bin = binaryPath()
  const src = sourcePath()

  writeFileSync(src, SWIFT_SOURCE.trim(), 'utf8')

  if (existsSync(bin)) return true

  console.log('[vdisplay] Compiling Swift helper (one-time, ~10 s)…')
  try {
    await execFileAsync('swiftc', [src, '-o', bin, '-O'], { timeout: 60_000 })
    chmodSync(bin, '755')
    console.log('[vdisplay] Compiled OK')
    return true
  } catch (e) {
    console.warn('[vdisplay] swiftc failed:', (e as Error).message)
    return false
  }
}

/**
 * Start the virtual display helper.
 * Returns the CGDirectDisplayID string on success, null on failure.
 * The returned promise resolves once the display is registered (~1 s).
 */
export async function startVirtualDisplay(): Promise<string | null> {
  if (process.platform !== 'darwin') return null

  const ok = await ensureCompiled()
  if (!ok) return null

  return new Promise((resolve) => {
    let resolved = false

    vdProc = spawn(binaryPath(), [], { stdio: ['ignore', 'pipe', 'pipe'] })

    vdProc.stdout?.once('data', (data: Buffer) => {
      const id = data.toString().trim()
      console.log(`[vdisplay] Virtual monitor ready — displayID ${id}`)
      resolved = true
      resolve(id)
    })

    vdProc.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg) console.warn(`[vdisplay] ${msg}`)
    })

    vdProc.on('error', (err) => {
      console.warn('[vdisplay] spawn error:', err.message)
      if (!resolved) { resolved = true; resolve(null) }
    })

    vdProc.on('exit', (code) => {
      console.log(`[vdisplay] process exited (code ${code})`)
      if (!resolved) { resolved = true; resolve(null) }
      vdProc = null
    })

    // If no stdout in 15 s, give up (compilation already done so this is a real error)
    setTimeout(() => {
      if (!resolved) { resolved = true; resolve(null) }
    }, 15_000)
  })
}

export function stopVirtualDisplay(): void {
  if (vdProc) {
    vdProc.kill()
    vdProc = null
    console.log('[vdisplay] Virtual display stopped')
  }
}
