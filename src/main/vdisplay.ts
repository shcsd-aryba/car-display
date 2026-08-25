/**
 * macOS virtual display helper.
 * Compiles and spawns an Objective-C binary that calls CGVirtualDisplayCreate,
 * which registers a real monitor with the OS (macOS 12.4+).
 * The virtual display stays alive as long as this process runs.
 *
 * LIMITATION: CGVirtualDisplayCreate requires the com.apple.developer.virtual-display
 * entitlement, which Apple only provisions to specific Developer teams upon request.
 * Ad-hoc signing with that entitlement causes amfid to SIGKILL the binary on Apple
 * Silicon. The feature therefore only works when the app is shipped with a proper
 * Apple Developer ID cert that has been granted the entitlement by Apple.
 *
 * In development (npm run dev), the binary runs without entitlements but
 * CGVirtualDisplayCreate is hidden behind the entitlement and returns NULL from
 * dlsym. The app falls back gracefully — existing screen/window sources still work.
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, writeFileSync, chmodSync } from 'fs'
import { execFile, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)


// Objective-C source.
// Uses CFBundleGetFunctionPointerForName (handles dyld shared cache) then
// falls back to dlsym. Property setters use objc_msgSend to avoid needing
// the private CGVirtualDisplay header at compile or link time.
const OBJC_SOURCE = `
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreFoundation/CoreFoundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <dlfcn.h>

typedef CGError (*VDCreateFn)(id descriptor, id *outDisplay, CGDisplayStreamRef *outStream);

static void printMacOSVersion(void) {
    NSOperatingSystemVersion v = [[NSProcessInfo processInfo] operatingSystemVersion];
    fprintf(stderr, "[vdisplay] macOS %ld.%ld.%ld\\n",
            (long)v.majorVersion, (long)v.minorVersion, (long)v.patchVersion);
}

static VDCreateFn findVDCreate(void) {
    VDCreateFn fn = NULL;

    // Best method: CFBundle handles the dyld shared cache on macOS 12+
    CFBundleRef cgBundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.CoreGraphics"));
    if (cgBundle) {
        fn = (VDCreateFn)CFBundleGetFunctionPointerForName(cgBundle, CFSTR("CGVirtualDisplayCreate"));
        if (fn) { fprintf(stderr, "[vdisplay] found via CFBundle(CoreGraphics)\\n"); return fn; }
    }

    // Fallback 1: already-loaded images (works if the entitlement unlocked visibility)
    fn = (VDCreateFn)dlsym(RTLD_DEFAULT, "CGVirtualDisplayCreate");
    if (fn) { fprintf(stderr, "[vdisplay] found via RTLD_DEFAULT\\n"); return fn; }

    // Fallback 2: explicit dlopen of CoreGraphics
    void *cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_LAZY | RTLD_NOLOAD);
    if (!cg) cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_LAZY);
    if (cg) {
        fn = (VDCreateFn)dlsym(cg, "CGVirtualDisplayCreate");
        if (fn) { fprintf(stderr, "[vdisplay] found via dlopen(CoreGraphics)\\n"); return fn; }
    }

    // Fallback 3: CoreDisplay private framework bundle
    CFBundleRef cdBundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.CoreDisplay"));
    if (cdBundle) {
        fn = (VDCreateFn)CFBundleGetFunctionPointerForName(cdBundle, CFSTR("CGVirtualDisplayCreate"));
        if (fn) { fprintf(stderr, "[vdisplay] found via CFBundle(CoreDisplay)\\n"); return fn; }
    }

    // Fallback 4: explicit dlopen of CoreDisplay
    void *cd = dlopen("/System/Library/PrivateFrameworks/CoreDisplay.framework/CoreDisplay", RTLD_LAZY);
    if (cd) {
        fn = (VDCreateFn)dlsym(cd, "CGVirtualDisplayCreate");
        if (fn) { fprintf(stderr, "[vdisplay] found via dlopen(CoreDisplay)\\n"); return fn; }
    }

    return NULL;
}

int main(void) {
    @autoreleasepool {
        printMacOSVersion();

        VDCreateFn vdCreate = findVDCreate();
        if (!vdCreate) {
            fprintf(stderr, "[vdisplay] CGVirtualDisplayCreate not available\\n");
            fprintf(stderr, "[vdisplay] This API requires com.apple.developer.virtual-display\\n");
            fprintf(stderr, "[vdisplay] which Apple only provisions to approved Developer teams.\\n");
            fprintf(stderr, "[vdisplay] In development mode the virtual display feature is disabled.\\n");
            return 1;
        }

        Class descClass = NSClassFromString(@"CGVirtualDisplayDescriptor");
        if (!descClass) {
            fprintf(stderr, "[vdisplay] CGVirtualDisplayDescriptor class not available\\n");
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
      '-framework', 'CoreFoundation',
      '-framework', 'Foundation',
      '-fobjc-arc'
    ], { timeout: 60_000 })
    chmodSync(bin, '755')
    console.log('[vdisplay] Compiled OK')
  } catch (e) {
    console.warn('[vdisplay] clang failed:', (e as Error).message)
    return false
  }

  // Plain ad-hoc sign — no entitlements plist.
  // com.apple.developer.virtual-display requires Apple provisioning; adding it
  // to an ad-hoc signature causes amfid to SIGKILL the binary on Apple Silicon.
  try {
    await execFileAsync('codesign', ['--force', '--sign', '-', bin], { timeout: 15_000 })
    console.log('[vdisplay] Codesigned (ad-hoc)')
  } catch (e) {
    console.warn('[vdisplay] codesign failed (continuing anyway):', (e as Error).message)
  }

  return true
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

    vdProc.on('exit', (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code}`
      console.log(`[vdisplay] process exited (${detail})`)
      if (signal === 'SIGKILL') {
        console.warn('[vdisplay] SIGKILL = amfid rejected entitlements, or binary needs re-sign')
      }
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
