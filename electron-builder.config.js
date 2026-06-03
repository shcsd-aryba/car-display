/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.cardisplay.app',
  productName: 'CarDisplay',
  directories: {
    buildResources: 'build'
  },
  files: [
    'out/**/*',
    'resources/**/*'
  ],
  // Native .node files cannot be loaded from inside an ASAR archive
  asarUnpack: [
    'node_modules/@nut-tree-fork/**/*'
  ],
  mac: {
    // Both keys required — entitlements for the app binary, entitlementsInherit for helper processes
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    extendInfo: {
      NSCameraUsageDescription: 'CarDisplay needs camera access for screen capture.',
      NSMicrophoneUsageDescription: 'CarDisplay needs microphone access.'
    },
    notarize: false,
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] }
    ]
  },
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] }
    ]
  },
  linux: {
    target: ['AppImage'],
    category: 'Utility'
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    createDesktopShortcut: true
  }
}
