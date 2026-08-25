// Native Node.js addon for macOS virtual display creation.
// Runs inside the Electron process (properly signed with Developer ID),
// which allows CGVirtualDisplayCreate to be resolved — the symbol is
// hidden from unsigned/ad-hoc binaries by dyld entitlement filtering.
//
// create() → displayID (number) on success, or null if unavailable
// destroy() → void, releases the virtual display

#include <napi.h>
#import <Foundation/Foundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <CoreFoundation/CoreFoundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <dlfcn.h>

typedef CGError (*VDCreateFn)(id descriptor, id *outDisplay, CGDisplayStreamRef *outStream);

static id      gVirtualDisplay = nil;
static CGDisplayStreamRef gStream = NULL;

static VDCreateFn findVDCreate() {
    VDCreateFn fn = nullptr;

    // CFBundleGetFunctionPointerForName is the correct API for symbols in
    // the dyld shared cache (framework .dylib files may not exist on disk).
    CFBundleRef cgBundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.CoreGraphics"));
    if (cgBundle) {
        fn = (VDCreateFn)CFBundleGetFunctionPointerForName(cgBundle, CFSTR("CGVirtualDisplayCreate"));
        if (fn) return fn;
    }

    fn = (VDCreateFn)dlsym(RTLD_DEFAULT, "CGVirtualDisplayCreate");
    if (fn) return fn;

    // Try CoreDisplay private framework as last resort
    CFBundleRef cdBundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.CoreDisplay"));
    if (cdBundle) {
        fn = (VDCreateFn)CFBundleGetFunctionPointerForName(cdBundle, CFSTR("CGVirtualDisplayCreate"));
    }
    return fn;
}

// create(): returns displayID as Number, or null if not available
Napi::Value Create(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (gVirtualDisplay) {
        // Already created — return existing displayID
        typedef CGDirectDisplayID (*GetDID)(id, SEL);
        CGDirectDisplayID did = ((GetDID)objc_msgSend)(gVirtualDisplay, sel_registerName("displayID"));
        return Napi::Number::New(env, (double)did);
    }

    VDCreateFn vdCreate = findVDCreate();
    if (!vdCreate) {
        return env.Null();
    }

    Class descClass = NSClassFromString(@"CGVirtualDisplayDescriptor");
    if (!descClass) return env.Null();

    id desc = [[descClass alloc] init];

    typedef void (*SetStr)(id, SEL, NSString *);
    typedef void (*SetSz)(id, SEL, CGSize);
    typedef void (*SetI32)(id, SEL, int32_t);
    typedef void (*SetU32)(id, SEL, uint32_t);
    ((SetStr)objc_msgSend)(desc, sel_registerName("setName:"),                   @"SideDisplay");
    ((SetSz) objc_msgSend)(desc, sel_registerName("setPixelSize:"),              CGSizeMake(1920, 1080));
    ((SetSz) objc_msgSend)(desc, sel_registerName("setSizeInMillimeters:"),      CGSizeMake(530, 300));
    ((SetI32)objc_msgSend)(desc, sel_registerName("setMaximumFramesPerSecond:"), (int32_t)60);
    ((SetU32)objc_msgSend)(desc, sel_registerName("setProductID:"),              (uint32_t)0xCA71);
    ((SetU32)objc_msgSend)(desc, sel_registerName("setVendorID:"),               (uint32_t)0xCA71);
    ((SetU32)objc_msgSend)(desc, sel_registerName("setSerialNum:"),              (uint32_t)1);

    id vd = nil;
    CGDisplayStreamRef stream = NULL;
    CGError err = vdCreate(desc, &vd, &stream);

    if (err != kCGErrorSuccess || !vd) {
        // Return the negative error code so the caller can log it
        return Napi::Number::New(env, -(double)(err ? err : 1));
    }

    // Keep strong references alive for the process lifetime
    gVirtualDisplay = vd;
    gStream = stream;

    typedef CGDirectDisplayID (*GetDID)(id, SEL);
    CGDirectDisplayID did = ((GetDID)objc_msgSend)(vd, sel_registerName("displayID"));
    return Napi::Number::New(env, (double)did);
}

// destroy(): releases the virtual display
Napi::Value Destroy(const Napi::CallbackInfo& info) {
    gVirtualDisplay = nil;
    gStream = NULL;
    return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "create"),  Napi::Function::New(env, Create));
    exports.Set(Napi::String::New(env, "destroy"), Napi::Function::New(env, Destroy));
    return exports;
}

NODE_API_MODULE(vdisplay, Init)
