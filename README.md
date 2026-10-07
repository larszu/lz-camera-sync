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
  <b>Camera setup:</b>
  <a href="docs/camera-setup.md">English</a> ·
  <a href="docs/kamera-einrichten.md">Deutsch</a>
  <sub>— FX3 and A7 IV over USB and Wi-Fi, step by step</sub>
</p>

<p align="center">
  <img src="docs/screenshots/desktop.png" alt="LZ Camera Sync — job track, the next step, camera tiles with operators and checkpoints" width="860" />
</p>

---

## A job in four steps

The app always shows one next step and one big button for it. A track at the
top counts every camera through the job; each camera tile fills three
checkpoints — *backed up*, *aligned*, *given back*.

| Step | What you do | What happens |
| --- | --- | --- |
| **1 · Connect** | Plug the cameras in over USB, or connect over Wi-Fi | Each body appears as a tile, named FX3 A, FX3 B … |
| **2 · Back up** | *Back up now* | Every camera is read completely and stored under its serial number — the way its operator set it up |
| **3 · Align** | Tap *Use as template* on the camera that is set up right, pick what carries over, *From FX3 A to 3 cameras* | The template's settings and the current time go to every camera; each one is read back and checked |
| **4 · Give back** | *Give back now* | Every camera gets its own backup back |

Then *Start a new job*. A camera that joins mid-job starts at step 1 on its
own; a camera that already carries the global setup is never backed up again,
so its private backup cannot be overwritten.

No camera at hand? *Try it with 3 simulated cameras* on the first screen runs
the whole job against simulated FX3 bodies — in the app and in the browser.

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/done.png" alt="Job complete: every camera given back" width="420" /><br /><b>Job complete</b></td>
    <td width="50%" align="center"><img src="docs/screenshots/desktop-light.png" alt="Light appearance, choosing the template" width="420" /><br /><b>Light appearance</b></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="docs/screenshots/phone.png" alt="Phone: back up step with operators" width="240" /><br /><b>Phone</b></td>
    <td width="50%" align="center"><img src="docs/screenshots/camera-sheet.png" alt="Camera sheet: private, now and global per setting" width="240" /><br /><b>Camera sheet: private · now · global</b></td>
  </tr>
</table>

## Why LZ Camera Sync

- **Cameras belong to people.** Tap the square on a tile and pick the
  operator, or type a new name; the backup stays with the camera's serial.
- **Everything is backed up, not just what the app knows.** The camera hands
  over every setting with its current value and allowed values in one call;
  each one it reports as writable goes into the backup.
- **Checked, not hoped.** After every write the camera is read back. Values it
  did not take, or does not offer, are named on the tile and in the camera
  sheet, which lists *private · now · global* per setting.
- **Lenses stay put.** Zoom and focus positions are never written, so a camera
  on a rig does not move when it is given back.
- **No Sony SDK.** Speaks PTP with Sony's vendor extension directly — the same
  path the [LZ Camera Bridge](https://github.com/larszu/lz-camera-bridge) uses
  for the FX3. One TypeScript core runs on desktop and phone.
- **Offline.** All data stays on the device and exports as one JSON file;
  the typeface ships with the app, nothing loads from the web.
- **Light and dark.** Follows the system, or set it in the menu.

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

Built to Sony's *Camera Control PTP 3 Reference*, tested against simulated
bodies — but no FX3 has been on the desk yet ([#3](https://github.com/larszu/lz-camera-sync/issues/3)).
What to watch on the first real camera:

- **Clock.** Sent as Sony documents it, `YYYYMMDDThhmmss.s±hhmm`. Some models
  cannot take a UTC offset; then set the camera to GMT in its menu and switch
  on *as UTC*. The camera's date menu must be closed while it is set.
- **Wi-Fi with Access Authentication.** SSH tunnel as documented, tested
  against a local SSH server that behaves the same way.
- **Values behind the exposure mode.** The camera switches to M for a moment
  during back-up and give-back; Sony's 500 ms pause after each mode change is
  kept.

The whole flow is tested against simulated FX3 bodies — USB framing byte for
byte, PTP/IP over split TCP packets, the SSH tunnel against a local server:
`npm test`.

## First start

**macOS:** the app is signed ad hoc, not notarised by Apple, so macOS blocks
the first start of a downloaded copy. Open it once, then *System Settings →
Privacy & Security → Open Anyway*. **Windows:** SmartScreen may warn about an
unknown publisher — *More info → Run anyway*. **Android:** allow installing
from this source when the APK asks.

## Prepare the camera

Step by step for the FX3 and A7 IV — camera menu, Mac and Windows, USB,
Wi-Fi with and without Access Authentication, Wi-Fi Direct, and what to check
when no camera shows up: **[docs/camera-setup.md](docs/camera-setup.md)** ·
[Deutsch](docs/kamera-einrichten.md).

In short: *Remote Shooting* on, no smartphone connected. USB: data cable,
choose *Remote Shooting* on the camera. Wi-Fi: same network, Access
Authentication on, IP from *Display Wi-Fi Info.*, compare the fingerprint
with *Access Authen. Info*.

## Values behind the exposure mode

A camera in P, A or S keeps its own manual shutter, ISO and aperture for M,
but does not offer them while it is in P. At back-up the app switches the
camera to the M of the same family for a moment (still M, Movie M, S&Q M …),
reads what it keeps there, and puts it back. At give-back it writes those
values in M and returns the camera to its own mode — the camera shows them
again the next time its operator switches to M. A body whose mode is set by a
dial is left alone.

## How it talks to the camera

| Step | PTP operation |
| --- | --- |
| Session | `OpenSession`, Sony SDIO handshake (protocol 3.00) |
| Back up | `GetAllExtDevicePropInfo` 0x9209 — every property, value, type, allowed values |
| Write | `SetExtDevicePropValue` 0x9205, exposure mode and movie format first, failures retried once after a fresh read |
| Clock | `DateTimeSet` 0xD223, string `YYYYMMDDThhmmss.s±hhmm` |
| Mode change | `ExposureProgramMode` 0x500E, then 500 ms before exposure values |
| Wi-Fi | PTP/IP on TCP 15740; with Access Authentication through SSH (port 22, `aes128-ctr`, forward to the camera's `localhost:15740`) |
| Never written | buttons (0xD2C0–0xD2FF), zoom and focus positions |

Opcodes and data layout follow Sony's Camera Control PTP 3 Reference and libgphoto2. All protocol code lives in
`src/core` (plain TypeScript, no Node APIs); a platform only provides byte
pipes — USB bulk and TCP — through `window.lzHost` ([electron/ptp-host.d.ts](electron/ptp-host.d.ts)).

## Build from source

Requires [Node.js](https://nodejs.org/) 22+.

```bash
npm install
npm run dev            # browser, http://localhost:4192 (simulator only)
npm run electron:dev   # desktop app with USB and Wi-Fi
npm test               # core tests + SSH tunnel
npm run fake-camera    # a simulated FX3 on 127.0.0.1:15740 (pairing style)
npm run fake-camera -- --ssh 2222   # with Access Authentication, user/password camera
npm run dist:mac       # or dist:win
```

To try the SSH path against the fake camera, start the app with
`LZ_SSH_PORT=2222` (a real camera always listens on 22).

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml)
for macOS, Windows, Linux and Android when a `v*` tag is pushed.

Built with Electron, Capacitor, React 19, TypeScript, Vite and Lucide icons.

## Licence

Source available, not open source. Free to use the released builds, including
commercially; no redistribution or derivative works without written consent.
See [LICENSE](LICENSE).
