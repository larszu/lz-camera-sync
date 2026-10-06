<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lzm_hauptlogo_offwhite.svg" />
    <img src="docs/brand/lzm_hauptlogo_navy.svg" alt="Lars Zumpe Medienproduktion" width="220" />
  </picture>
</p>

<h1 align="center">LZ Camera Sync</h1>

<p align="center">
  <b>One setup for every camera on the job — and each camera back to its owner afterwards.</b><br />
  Back up, align and restore the settings of several Sony cameras, starting with the FX3.
</p>

<p align="center">
  <a href="https://github.com/larszu/lz-camera-sync/releases/latest">
    <img src="https://img.shields.io/badge/Download-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux%20%C2%B7%20Android-1D324F?style=for-the-badge&logo=github&logoColor=white" alt="Download LZ Camera Sync" height="40" />
  </a>
</p>

<p align="center">
  <img src="docs/screenshots/desktop.png" alt="LZ Camera Sync — job steps, connected cameras with operators, global setups" width="860" />
</p>

---

## Why LZ Camera Sync

- **Three steps per job.** *Back up private* reads every connected camera
  completely. *Push global* writes one setup to all of them, with the current
  time if you want it. *Restore private* gives every camera its own settings
  back.
- **The global setup comes from a camera.** Dial one body in by hand, take
  its settings and pick what the setup carries: exposure, white balance,
  picture profile, movie format, focus, stabiliser, the rest.
- **Cameras belong to people.** Name each body, assign it to an operator; the
  private backup stays with the camera's serial number.
- **Everything is backed up, not just what the app knows.** The camera hands
  over every setting with its current value and allowed values in one call;
  each one it reports as writable goes into the backup.
- **Checked, not hoped.** After every write the camera is read back; values it
  did not take, or does not offer, are listed per camera.
- **Lenses stay put.** Zoom and focus positions are never written, so a camera
  on a rig does not move when it is restored.
- **No Sony SDK.** Speaks PTP with Sony's vendor extension directly — the same
  path the [LZ Camera Bridge](https://github.com/larszu/lz-camera-bridge) uses
  for the FX3. One TypeScript core runs on desktop and phone.
- **Offline.** All data stays on the device and exports as one JSON file;
  the typeface ships with the app, nothing loads from the web.
- **Light and dark.** Follows the system or a choice in the header.

## Screenshots

<table>
  <tr>
    <td width="40%" align="center"><img src="docs/screenshots/desktop.png" alt="Desktop, dark" width="380" /><br /><b>Desktop · dark</b></td>
    <td width="40%" align="center"><img src="docs/screenshots/desktop-light.png" alt="Desktop, light" width="380" /><br /><b>Desktop · light</b></td>
    <td width="20%" align="center"><img src="docs/screenshots/phone.png" alt="Phone layout" width="180" /><br /><b>Phone</b></td>
  </tr>
</table>

## Platforms

| | USB | Wi-Fi (PTP/IP) | Download |
| --- | --- | --- | --- |
| **macOS** | ✓ libusb | ✓ | `.dmg` (Apple Silicon, Intel) |
| **Windows** | ✓ libusb, WinUSB driver needed | ✓ | Installer, portable `.exe` |
| **Linux** | ✓ libusb | ✓ | `.AppImage` |
| **Android** | native plugin in progress | native plugin in progress | `.apk` |
| **iOS** | no raw USB on iOS | native plugin in progress | — (needs an Apple developer account) |

The Android build runs the full interface with simulated cameras today; the
native camera plugins are tracked in [#5](https://github.com/larszu/lz-camera-sync/issues/5)
and [#6](https://github.com/larszu/lz-camera-sync/issues/6). Details in
[docs/mobile.md](docs/mobile.md).

## Not yet verified on a camera

Marked honestly until an FX3 has been on the desk ([#3](https://github.com/larszu/lz-camera-sync/issues/3)):

- **Clock.** Data type of `DateTimeSet` (0xD223) and whether the FX3 expects
  local time or UTC (switch *send as UTC*). The camera's date menu must be
  closed while it is set.
- **Wi-Fi.** Framing per CIPA DC-005 / libgphoto2; the access authentication
  newer Sony bodies require is not implemented yet ([#7](https://github.com/larszu/lz-camera-sync/issues/7)).
- **Mode-locked values.** A body backed up in P/A/S does not report its manual
  shutter as writable, so that value is not in the backup ([#4](https://github.com/larszu/lz-camera-sync/issues/4)).

The whole flow is tested against simulated FX3 bodies, including the USB
framing byte for byte: `npm test`.

## Prepare the camera (FX3, USB)

Menu → Network → *PC Remote* on, USB connection *PC Remote*. On Windows libusb
needs a WinUSB driver for the camera (e.g. with Zadig), which replaces Sony's
own driver for that device. On macOS `ptpcamerad` may hold the camera; run
`killall ptpcamerad` before connecting.

## How it talks to the camera

| Step | PTP operation |
| --- | --- |
| Session | `OpenSession`, Sony SDIO handshake (protocol 3.00) |
| Back up | `GetAllExtDevicePropInfo` 0x9209 — every property, value, type, allowed values |
| Write | `SetExtDevicePropValue` 0x9205, exposure mode and movie format first, failures retried once after a fresh read |
| Clock | `DateTimeSet` 0xD223, 64-bit Unix time as documented in Sony's Camera Remote SDK |
| Never written | buttons (0xD2C0–0xD2FF), zoom and focus positions |

Opcodes and data layout follow libgphoto2. All protocol code lives in
`src/core` (plain TypeScript, no Node APIs); a platform only provides byte
pipes — USB bulk and TCP — through `window.lzHost` ([electron/ptp-host.d.ts](electron/ptp-host.d.ts)).

## Build from source

Requires [Node.js](https://nodejs.org/) 22+.

```bash
npm install
npm run dev            # browser, http://localhost:4192 (simulator only)
npm run electron:dev   # desktop app with USB and Wi-Fi
npm test               # core tests
npm run dist:mac       # or dist:win
```

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml)
for macOS, Windows, Linux and Android when a `v*` tag is pushed.

Built with Electron, Capacitor, React 19, TypeScript and Vite.

## Licence

Source available, not open source. Free to use the released builds, including
commercially; no redistribution or derivative works without written consent.
See [LICENSE](LICENSE).
