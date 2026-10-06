# LZ Camera Sync

Mehrere Sony-Kameras (zuerst FX3) für einen Job gleich einstellen und danach jede Kamera wieder so zurückgeben, wie ihr Bediener sie hatte.

1. **Privat sichern** – liest jede verbundene Kamera komplett aus und legt die Sicherung unter ihrer Seriennummer ab.
2. **Global setzen** – schreibt ein globales Setup auf alle Kameras, optional mit der aktuellen Uhrzeit dieses Geräts.
3. **Privat zurück** – spielt jeder Kamera ihre eigene Sicherung zurück.

Das globale Setup entsteht an einer Kamera: dort von Hand einstellen, dann *Global-Setup übernehmen von …* und auswählen, was es enthält (Belichtung, Weißabgleich, Bildprofil, Movie-Format, Fokus, Stabilisator, Rest). Kameras lassen sich Bedienern zuordnen. Alle Daten (Bediener, Sicherungen, Setups) liegen lokal und lassen sich als JSON exportieren.

## Wie es mit der Kamera spricht

Kein Sony-SDK. Die App spricht direkt **PTP mit Sonys Vendor-Erweiterung** – derselbe Weg, den [lz-camera-bridge](https://github.com/larszu/lz-camera-bridge) für die FX3 über USB nutzt; Opcodes und Datenformat stammen aus libgphoto2.

- Sicherung: `GetAllExtDevicePropInfo` (0x9209) liefert jede Einstellung mit aktuellem Wert, Datentyp und erlaubten Werten in einem Aufruf. Gesichert wird alles, was die Kamera als schreibbar meldet – auch Eigenschaften, die die App nicht beim Namen kennt.
- Schreiben: `SetExtDevicePropValue` (0x9205). Reihenfolge: Belichtungsmodus und Movie-Format zuerst, dann der Rest; was abgelehnt wird, wird nach erneutem Auslesen ein zweites Mal versucht. Danach wird zurückgelesen und jede Abweichung gemeldet.
- Uhrzeit: `DateTimeSet` (0xD223), als 64-bit-Unix-Zeit wie im Camera Remote SDK dokumentiert.
- Nie geschrieben: Tasten/Aktionen (0xD2C0–0xD2FF) und Objektivpositionen (Zoom, Fokus) – eine Kamera am Rig soll beim Zurücksetzen nicht fahren.

Die gesamte Protokoll-Logik steckt in `src/core` (reines TypeScript, ohne Node-APIs) und läuft so unverändert in Desktop- und Handy-App. Die Plattform liefert nur Byte-Leitungen: USB-Bulk und TCP (`electron/ptp-host.d.ts`).

| Weg | Desktop (Mac/Windows) | Android | iOS |
|---|---|---|---|
| USB (PTP) | ✓ libusb | Plugin offen (USB-Host-API) | kein Roh-USB – siehe [docs/mobile.md](docs/mobile.md) |
| WLAN (PTP/IP, Port 15740) | ✓ node:net | Plugin offen | Plugin offen |
| Simulator | ✓ | ✓ | ✓ |

## Noch nicht an einer echten Kamera geprüft

Ehrlich markiert, bis eine FX3 am Tisch war:

- **Uhrzeit**: Datentyp von 0xD223 und ob die FX3 Ortszeit oder UTC erwartet (Schalter *als UTC senden*). Das Uhrzeit-Menü der Kamera muss beim Setzen geschlossen sein.
- **PTP/IP über WLAN**: Rahmenformat nach CIPA DC-005/libgphoto2. Neuere Sony-Gehäuse verlangen für PC-Fernsteuerung im Netz eine Zugangs-Authentifizierung – die ist nicht umgesetzt.
- **Werte, die der Modus sperrt**: Steht eine Kamera beim Sichern in P/A/S, meldet sie z. B. die Verschlusszeit nicht als schreibbar; die gespeicherte M-Zeit wird dann nicht gesichert.

Getestet ist der komplette Ablauf mit drei simulierten FX3 (eigene Modus-Abhängigkeit) und das USB-Framing auf Byte-Ebene: `npm test`.

## Kamera vorbereiten (FX3, USB)

Menü → Netzwerk → *PC-Fernbedienung* an, USB-Verbindung *PC-Fernbedienung*. Windows braucht für libusb einen WinUSB-Treiber (z. B. Zadig) – das schließt Sonys eigenen Treiber für dieses Gerät aus. Auf dem Mac kann `ptpcamerad` die Kamera belegen; dann hilft `killall ptpcamerad` vor dem Verbinden.

## Entwickeln

```bash
npm install
npm run dev            # Browser, http://localhost:4192 (nur Simulator)
npm run electron:dev   # Desktop-App mit USB/WLAN
npm test               # Kernlogik
npm run dist:mac       # bzw. dist:win
```

Dev-Port 4192 (`strictPort`). Keine GitHub-Actions: das Repo ist privat, Actions-Minuten kosten.

## Handy-Apps

Capacitor-Hülle um denselben Web-Build (`capacitor.config.ts`). Stand und offene Schritte: [docs/mobile.md](docs/mobile.md).
