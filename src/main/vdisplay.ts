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

// Objective-C source.
// CGVirtualDisplayCreate exists in the RUNTIME CoreGraphics.framework on macOS 12.4+
// but is NOT in the SDK linker stubs, so -framework CoreGraphics alone fails.
// We use dlsym() to look it up at runtime and objc_msgSend for property setters,
// which avoids any compile-time or link-time dependency on the private header.
const OBJC_SOURCE = `
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <dlfcn.h>

typedef CGError (*VDCreateFn)(id descriptor, id *outDisplay, CGDisplayStreamRef *outStream);

static VDCreateFn findVDCreate(void) {
    // Search already-loaded images first, then load CoreGraphics explicitly.
    VDCreateFn fn = (VDCreateFn)dlsym(RTLD_DEFAULT, "CGVirtualDisplayCreate");
    if (fn) return fn;
    void *cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_LAZY | RTLD_NOLOAD);
    if (!cg) cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_LAZY);
    if (cg) { fn = (VDCreateFn)dlsym(cg, "CGVirtualDisplayCreate"); if (fn) return fn; }
    // Fallback: CoreDisplay private framework (used by some apps on older macOS)
    void *cd = dlopen("/System/Library/PrivateFrameworks/CoreDisplay.framework/CoreDisplay", RTLD_LAZY);
    if (cd) { fn = (VDCreateFn)dlsym(cd, "CGVirtualDisplayCreate"); }
    return fn;
}

int main(void) {
    @autoreleasepool {
        VDCreateFn vdCreate = findVDCreate();
        if (!vdCreate) {
            fprintf(stderr, "[vdisplay] CGVirtualDisplayCreate not found — requires macOS 12.4+\\n");
            return 1;
        }

        Class descClass = NSClassFromString(@"CGVirtualDisplayDescriptor");
        if (!descClass) {
            fprintf(stderr, "[vdisplay] CGVirtualDisplayDescriptor not available\\n");
            return 1;
        }

        id desc = [[descClass alloc] init];

        // Set properties via objc_msgSend — no private header needed.
        typedef void (*SetStr)(id, SEL, NSString *);
        typedef void (*SetSz)(id, SEL, CGSize);
        typedef void (*SetI32)(id, SEL, int32_t);
        typedef void (*SetU32)(id, SEL, uint32_t);
        ((SetStr) objc_msgSend)(desc, sel_registerName("setName:"),                   @"SideDisplay");
        ((SetSz)  objc_msgSend)(desc, sel_registerName("setPixelSize:"),              CGSizeMake(1920, 1080));
        ((SetSz)  objc_msgSend)(desc, sel_registerName("setSizeInMillimeters:"),      CGSizeMake(530, 300));
        ((SetI32) objc_msgSend)(desc, sel_registerName("setMaximumFramesPerSecond:"), (int32_t)60);
        ((SetU32) objc_msgSend)(desc, sel_registerName("setProductID:"),              (uint32_t)0xCA71);
        ((SetU32) objc_msgSend)(desc, sel_registerName("setVendorID:"),               (uint32_t)0xCA71);
        ((SetU32) objc_msgSend)(desc, sel_registerName("setSerialNum:"),              (uint32_t)1);

        id vd = nil;
        CGDisplayStreamRef stream = NULL;
        CGError err = vdCreate(desc, &vd, &stream);

        if (err != kCGErrorSuccess || !vd) {
            fprintf(stderr, "[vdisplay] CGVirtualDisplayCreate returned error %d\\n", (int)err);
            return err ? (int)err : 1;
        }

        typedef CGDirectDisplayID (*GetDID)(id, SEL);
        CGDirectDisplayID did = ((GetDID)objc_msgSend)(vd, sel_registerName("displayID"));
        printf("%u\\n", did);
        fflush(stdout);

        [[NSRunLoop mainRunLoop] run];
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
