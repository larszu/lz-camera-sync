// Packaging for macOS and Windows. ESM here; the packaged package.json must
// not say "type": "module" (av-planner-skelett: the universal entry shim is
// CommonJS and dies otherwise) — extraMetadata fixes only the packaged copy.
export default {
  appId: 'de.zumpelars.lzcamerasync',
  productName: 'LZ Camera Sync',
  copyright: `© ${new Date().getFullYear()} Lars Zumpe Medienproduktion`,
  directories: { output: 'release' },
  files: ['dist/**/*', 'electron/**/*', 'package.json'],
  extraMetadata: { type: 'commonjs' },
  publish: [{ provider: 'github', owner: 'larszu', repo: 'lz-camera-sync', releaseType: 'release' }],
  win: { target: ['nsis', 'portable'] },
  portable: { artifactName: 'LZ-Camera-Sync-Portable-${version}.${ext}' },
  nsis: { oneClick: true, artifactName: 'LZ-Camera-Sync-Setup-${version}.${ext}' },
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.video',
    artifactName: 'LZ-Camera-Sync-${version}-${arch}.${ext}',
  },
}
