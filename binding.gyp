{
  "targets": [{
    "target_name": "vdisplay",
    "sources": ["native/vdisplay.mm"],
    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")"
    ],
    "dependencies": [
      "<!(node -p \"require('node-addon-api').gyp\")"
    ],
    "conditions": [["OS=='mac'", {
      "xcode_settings": {
        "CLANG_ENABLE_OBJC_ARC": "YES",
        "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
        "MACOSX_DEPLOYMENT_TARGET": "12.4",
        "OTHER_LDFLAGS": [
          "-framework CoreGraphics",
          "-framework CoreFoundation",
          "-framework Foundation"
        ]
      }
    }]],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"]
  }]
}
