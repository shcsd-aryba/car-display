/**
 * macOS virtual display helper.
 * Compiles and spawns an Objective-C binary that calls CGVirtualDisplayCreate,
 * which registers a real monitor with the OS (macOS 12.4+).
 * The virtual display stays alive as long as this process runs.
 *
 * Note: CGVirtualDisplay.h is in CoreGraphics.framework but is NOT in the Swift
 * module map, so Swift's `import CoreGraphics` can't see it. We use Objective-C
 * with forward-declared @interfaces instead — the symbols are present at link time.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, chmodSync } from 'fs'
import { execFile, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Objective-C source — forward-declares the CGVirtualDisplay classes so
// clang accepts the code even though the header isn't in the module map.
// CoreGraphics.framework exports the symbols at runtime.
const OBJC_SOURCE = `
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>

// Forward-declare CGVirtualDisplay interfaces (public API since macOS 12.4).
// Not in the Swift/ObjC module map, but present in CoreGraphics at link time.
@interface CGVirtualDisplayDescriptor : NSObject
@property CGSize     pixelSize;
@property CGSize     sizeInMillimeters;
@property int32_t    maximumFramesPerSecond;
@property uint32_t   productID;
@property uint32_t   vendorID;
@property uint32_t   serialNum;
@property (copy) NSString *name;
@end

@interface CGVirtualDisplay : NSObject
@property (readonly) CGDirectDisplayID displayID;
@end

CGError CGVirtualDisplayCreate(CGVirtualDisplayDescriptor *descriptor,
                                CGVirtualDisplay **outDisplay,
                                CGDisplayStreamRef *outStream);

int main(void) {
    @autoreleasepool {
        if (@available(macOS 12.4, *)) {
            CGVirtualDisplayDescriptor *desc = [[CGVirtualDisplayDescriptor alloc] init];
            desc.name                   = @"SideDisplay";
            desc.pixelSize              = CGSizeMake(1920, 1080);
            desc.sizeInMillimeters      = CGSizeMake(530, 300);
            desc.maximumFramesPerSecond = 60;
            desc.productID              = 0xCA71;
            desc.vendorID               = 0xCA71;
            desc.serialNum              = 1;

            CGVirtualDisplay *vd = nil;
            CGDisplayStreamRef stream = NULL;
            CGError err = CGVirtualDisplayCreate(desc, &vd, &stream);

            if (err != kCGErrorSuccess || !vd) {
                fprintf(stderr, "[vdisplay] CGVirtualDisplayCreate failed (%d)\\n", (int)err);
                return err ? (int)err : 1;
            }

            // Print displayID to stdout so the parent knows we are ready
            printf("%u\\n", vd.displayID);
            fflush(stdout);

            // Run forever — virtual display lives as long as this process runs
            [[NSRunLoop mainRunLoop] run];
        } else {
            fprintf(stderr, "[vdisplay] requires macOS 12.4+\\n");
            return 1;
        }
    }
    return 0;
}
`

let vdProc: ChildProcess | null = null

function binaryPath(): string {
  return join(app.getPath('userData'), 'SideDisplay-vdisplay')
}

function sourcePath(): string {
  return join(app.getPath('userData'), 'SideDisplay-vdisplay.m')
}

async function ensureCompiled(): Promise<boolean> {
  const bin = binaryPath()
  const src = sourcePath()

  writeFileSync(src, OBJC_SOURCE.trim(), 'utf8')

  if (existsSync(bin)) return true

  console.log('[vdisplay] Compiling ObjC helper (one-time)…')
  try {
    await execFileAsync('clang', [
      src, '-o', bin,
      '-framework', 'CoreGraphics',
      '-framework', 'Foundation',
      '-fobjc-arc'
    ], { timeout: 60_000 })
    chmodSync(bin, '755')
    console.log('[vdisplay] Compiled OK')
    return true
  } catch (e) {
    console.warn('[vdisplay] clang failed:', (e as Error).message)
    return false
  }
}

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
