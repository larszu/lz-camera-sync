import type { CapacitorConfig } from '@capacitor/cli'

// iOS / Android shell around the same web build. The native camera transport
// (USB host on Android, PTP/IP over Wi-Fi on both) is a plugin that provides
// window.lzHost — see docs/mobile.md for what exists and what does not yet.
const config: CapacitorConfig = {
  appId: 'de.zumpelars.lzcamerasync',
  appName: 'LZ Camera Sync',
  webDir: 'dist',
  backgroundColor: '#132040',
}

export default config
