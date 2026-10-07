# Setting up camera and computer

This guide connects a Sony FX3 or A7 IV to LZ Camera Sync — over USB or Wi-Fi. Both bodies share the same menu; paths follow Sony's English help guides.

[Deutsche Fassung](kamera-einrichten.md)

## Overview

| Path | When | What you need |
| --- | --- | --- |
| **USB** | camera next to the computer | USB-C data cable |
| **Wi-Fi via router** | several cameras, rigs, distance | camera and computer on the same network |
| **Wi-Fi Direct** | no router on site | the computer joins the camera's own network |

On the camera, for every path:

- `MENU → Network → Cnct./Remote Sht. → Remote Shoot Function → Remote Shooting → On`
- No smartphone connected: while a phone is connected, the camera cannot be controlled from a computer.

## USB

1. Switch the camera on, card inserted.
2. Connect it with a **data cable**. Charge-only cables carry no data — when in doubt, use the cable from the camera box.
3. The camera offers a choice: select **Remote Shooting**.
4. In LZ Camera Sync: **Find USB cameras**.

### On a Mac

- Quit apps that talk to cameras: Imaging Edge, Capture One, Lightroom, Image Capture.
- macOS claims cameras through its `ptpcamerad` service. Before searching, in Terminal:

  ```bash
  killall ptpcamerad
  ```

### On Windows

The app reaches the camera through libusb, which needs the **WinUSB driver** for the camera once — for example with [Zadig](https://zadig.akeo.ie/): plug the camera in, pick the Sony device in Zadig, install WinUSB. This driver replaces Sony's own driver for that device.

### When no camera is found

1. Does the computer see the camera at all?
   - **Mac:** Apple menu → About This Mac → More Info → System Report → **USB**. A Sony device must be listed.
   - **Windows:** Device Manager.
2. Nothing listed: the problem is before the app — try another cable, select **Remote Shooting** on the camera, wake it up, try another port.
3. Listed, but the app finds nothing: quit other camera apps, on a Mac run `killall ptpcamerad`, on Windows check the WinUSB driver.

## Wi-Fi via a router

### On the camera

1. **Join the network:** `MENU → Network → Wi-Fi → Wi-Fi Connect → On`, then `Access Point Set.` → pick the network and enter its password (or `WPS Push`).
2. **Access Authentication** (recommended): `MENU → Network → Network Option → Access Authen. Settings`
   - `Access Authen.` → **On**
   - set `User` (up to 16 characters)
   - set `Password` (8–16 characters) or `Generate Password`
3. **Read the IP address:** `MENU → Network → Wi-Fi → Display Wi-Fi Info.`
4. **Keep the fingerprint at hand:** `MENU → Network → Network Option → Access Authen. Info` shows user, password and fingerprint.

### On the Mac

1. Join the **same network** as the camera. Guest networks often keep devices apart — use a regular one.
2. On the first connection macOS asks whether LZ Camera Sync may find **devices on the local network**: **Allow**. Changeable later under *System Settings → Privacy & Security → Local Network*.

### In LZ Camera Sync

1. **Connect over Wi-Fi**, enter the camera's IP address.
2. Keep **Access Authentication on the camera** on, enter user and password from the camera.
3. On the first connection the app shows the camera's **fingerprint**. Compare it with `Access Authen. Info` on the camera; if it matches: **Matches — connect**.

The app remembers the fingerprint per IP address and the user name, never the password. If a camera at the same IP answers with a different key, the app asks again — that happens after a camera reset, or when another device poses as the camera.

### Without Access Authentication

With `Access Authen.` **Off**, the camera pairs instead: switch Access Authentication off in the app and connect; the camera shows "LZ Camera Sync" and asks to pair — confirm on the camera. If needed, open `Remote Shoot Function → Pairing` first. Without Access Authentication the connection is not encrypted.

## Wi-Fi Direct

1. On the camera: `MENU → Network → Cnct./Remote Sht. → Remote Shoot Function → Wi-Fi Direct Info.` — shows network name (`DIRECT-…`) and password.
2. Join that network on the Mac. While it is on the camera's network, the Mac has no internet.
3. In LZ Camera Sync connect to IP **192.168.122.1**, then as above.

## What the app does on the camera

- **Back up** reads every setting. If the camera is in P, A or S, the app switches to the M mode of the same family for a moment, reads shutter, ISO and aperture there, and switches back.
- **Align** writes the global setup and, if chosen, the time.
- **Give back** writes the backup; values from the M mode in the M mode, then the camera is back in its own mode.
- **Never written:** button functions and the zoom and focus position — a camera on a rig does not move.

## Clock

- The app sends the computer's time with its time zone. The camera's date and time menu must be closed while it is set.
- Some models do not take a time zone. Then set the camera to **GMT** in its menu and switch on **as UTC** in the app.

## Sources

Sony help guides: [FX3 Remote Shoot Function](https://helpguide.sony.net/ilc/2210/v1/en/contents/TP1000884035.html) · [FX3 Wi-Fi info](https://helpguide.sony.net/ilc/2210/v1/en/contents/TP1000884194.html) · [FX3 connecting to a router](https://helpguide.sony.net/promobile/mc/v1/en/contents/connecting_access_point_fx3.html) · [A7 IV Remote Shoot Function](https://helpguide.sony.net/ilc/2110/v1/en/contents/TP1000656591.html) · [A7 IV Access Authen. Settings](https://helpguide.sony.net/ilc/2110/v1/en/contents/TP1000954812.html). Connection details (SSH, port, clock format): Sony *Camera Control PTP 3 Reference*.
