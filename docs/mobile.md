# Handy-Apps (iOS / Android)

Die Oberfläche und die ganze Kamera-Logik (`src/core`) laufen im Web-View unverändert. Was fehlt, ist je Plattform ein kleines natives Plugin, das `window.lzHost` bereitstellt – dieselbe Form wie in Electron (`electron/ptp-host.d.ts`): Bytes schreiben, Bytes lesen, schließen.

## Plattformprojekte anlegen

```bash
npm run build
npx cap add android   # braucht Android Studio / SDK
npx cap add ios       # braucht Xcode
npm run cap:sync
```

Die nativen Ordner sind noch nicht eingecheckt; sie entstehen mit dem ersten Plugin.

## Android

- **USB**: `UsbManager` + `UsbDeviceConnection.bulkTransfer` auf das Still-Image-Interface (Klasse 6) der Kamera. Android erlaubt das per USB-OTG ohne Root. Das Plugin implementiert `lzHost.usb` (list/open/write/read/close); die PTP-Rahmen baut `PtpUsbTransport` im Web-Teil.
- **WLAN**: TCP-Socket-Plugin für `lzHost.tcp`, dann `PtpIpTransport`. Mit Zugangs-Authentifizierung braucht das Plugin zusätzlich SSH (Port 22, `aes128-ctr`, Tastatur-interaktive Anmeldung, Weiterleitung auf `localhost:15740`) und muss den Host-Schlüssel-Fingerprint melden – Vorbild ist `electron/ssh-tunnel.cjs`, Fehlertexte `ssh-fingerprint-unknown|mismatch <sha256> <md5>`.

## iOS

- **USB**: iOS gibt Apps keinen Roh-Zugriff auf USB-Bulk-Endpunkte. Möglicher Weg: `ImageCaptureCore` mit `ICCameraDevice.requestSendPTPCommand`, das einzelne PTP-Transaktionen durchreicht. Dann implementiert das Plugin direkt `PtpTransport.transaction` statt einer Byte-Leitung. Ob iOS das für eine FX3 am USB-C-iPhone zulässt, ist ungeprüft.
- **WLAN**: TCP über `Network.framework` als Plugin für `lzHost.tcp`, für die Zugangs-Authentifizierung zusätzlich SSH (z. B. NMSSH/libssh2) wie unter Android beschrieben. Für eine App im App Store ist das der realistische Weg.

## Pairing per NFC (Issue #1)

Die FX3 hat nach aktuellem Stand kein NFC. Für schnelles Verbinden am Set eignet sich eher: Kamera per USB anstecken (Android) oder IP/QR-Code aus dem Kamera-Menü übernehmen (WLAN).
