# Kamera und Rechner einrichten

Diese Anleitung bringt eine Sony FX3 oder A7 IV mit LZ Camera Sync zusammen – per USB oder per WLAN. Beide Modelle haben dasselbe Menü. Die Menünamen stehen so, wie das deutsche Kameramenü sie zeigt (laut Sonys deutschen Hilfe-Handbüchern), dahinter in Klammern die englische Bezeichnung.

[English version](camera-setup.md)

## Überblick

| Weg | Wann | Was du brauchst |
| --- | --- | --- |
| **USB** | Kamera steht neben dem Rechner | Datenkabel USB-C |
| **WLAN über Router** | mehrere Kameras, Rig, Abstand | Kamera und Rechner im selben WLAN |
| **WLAN direkt (Wi-Fi Direct)** | kein Router vor Ort | Rechner verbindet sich mit dem WLAN der Kamera |

Für alle Wege gilt an der Kamera:

- `MENU → Netzwerk → Verb./FB-Aufn. → Fernb.-Aufn.-Funkt. → Fernbed.-Aufn. → Ein`  
  (Network → Cnct./Remote Sht. → Remote Shoot Function → Remote Shooting → On)
- Keine Smartphone-Verbindung aktiv: Solange ein Handy mit der Kamera verbunden ist, lässt sie sich nicht vom Rechner steuern.

## USB

1. Kamera einschalten, Speicherkarte einlegen.
2. Mit einem **Datenkabel** an den Rechner stecken. Reine Ladekabel übertragen keine Daten – im Zweifel das Kabel aus dem Kamerakarton nehmen.
3. Die Kamera zeigt eine Auswahl: **Fernbed.-Aufn.** wählen. Fest einstellen lässt es sich unter `MENU → Einstellung → USB → USB-Verbind.modus → Fernbed.-Aufn.` (nicht *Bildübertragung (MSC)* oder *(MTP)*).
4. In LZ Camera Sync: **USB-Kameras suchen**.

### Am Mac

- Programme beenden, die Kameras ansprechen: Imaging Edge, Capture One, Lightroom, „Digitale Bilder“.
- macOS greift Kameras über den Dienst `ptpcamerad` selbst ab. Vor dem Suchen im Terminal:

  ```bash
  killall ptpcamerad
  ```

### Unter Windows

Die App spricht die Kamera über libusb an. Dafür braucht die Kamera einmalig den **WinUSB-Treiber**, zum Beispiel mit [Zadig](https://zadig.akeo.ie/): Kamera anstecken, in Zadig das Sony-Gerät wählen, WinUSB installieren. Dieser Treiber ersetzt für dieses Gerät Sonys eigenen Treiber.

### Wenn keine Kamera gefunden wird

1. Sieht der Rechner die Kamera überhaupt?
   - **Mac:** Apple-Menü → Über diesen Mac → Weitere Infos → Systembericht → **USB**. Dort muss ein Sony-Gerät stehen.
   - **Windows:** Geräte-Manager.
2. Steht dort nichts, liegt es vor der App: Kabel tauschen, an der Kamera **Fernbed.-Aufn.** wählen, Kamera aufwecken, andere Buchse probieren.
3. Steht die Kamera dort, aber die App findet sie nicht: anderes Kameraprogramm beenden, am Mac `killall ptpcamerad`, unter Windows den WinUSB-Treiber prüfen.

## WLAN über einen Router

### An der Kamera

1. **Ins WLAN:** `MENU → Netzwerk → Wi-Fi → Wi-Fi-Verbindung → Ein`, dann `MENU → Netzwerk → Wi-Fi → Zugriffspkt.-Einstlg.` → das WLAN wählen und das Passwort eingeben. Alternativ `WPS-Tastendruck`, wenn der Router WPS kann.
2. **Zugriffsauthentifizierung prüfen** (empfohlen): `MENU → Netzwerk → Netzwerkoption → ZugrAuthent.Einstlg.` (Access Authen. Settings)
   - `Zugriffsauthentif.` → **Ein** – ab Werk eingeschaltet
   - `Benutzer` (bis 16 Zeichen) und `Passwort` (8–16 Zeichen) sind ab Werk automatisch vergeben. Eigene festlegen oder `Passwort generieren`.
3. **IP-Adresse ablesen:** `MENU → Netzwerk → Wi-Fi → Wi-Fi-Infos anzeigen`
4. **Fingerabdruck bereithalten:** `MENU → Netzwerk → Netzwerkoption → ZugriffAuthent.-Infos` zeigt Benutzer, Passwort und Fingerabdruck.

### Am Mac

1. Den Mac ins **selbe WLAN** wie die Kamera bringen. Gäste-WLANs trennen Geräte oft voneinander – dann ein normales WLAN nehmen.
2. Beim ersten Verbinden fragt macOS, ob LZ Camera Sync **Geräte im lokalen Netzwerk** finden darf: **Erlauben**. Nachträglich änderbar unter *Systemeinstellungen → Datenschutz & Sicherheit → Lokales Netzwerk*.

### In LZ Camera Sync

1. **Über WLAN verbinden**, die IP-Adresse der Kamera eintragen.
2. **Zugriffsauthentifizierung an der Kamera** eingeschaltet lassen, Benutzer und Passwort aus `ZugriffAuthent.-Infos` eingeben.
3. Beim ersten Verbinden zeigt die App den **Fingerabdruck** der Kamera. Mit `ZugriffAuthent.-Infos` an der Kamera vergleichen; stimmt er überein: **Stimmt überein – verbinden**.

Die App merkt sich den Fingerabdruck je IP-Adresse und den Benutzernamen, das Passwort nie. Meldet eine Kamera unter derselben IP einen anderen Schlüssel, fragt die App erneut nach – das passiert nach einem Zurücksetzen der Kamera, oder wenn sich ein anderes Gerät als Kamera ausgibt.

### Ohne Zugriffsauthentifizierung

Steht `Zugriffsauthentif.` auf **Aus**, koppelt die Kamera stattdessen: An der Kamera `MENU → Netzwerk → Verb./FB-Aufn. → Fernb.-Aufn.-Funkt. → Kopplung` aufrufen, in der App die Zugriffsauthentifizierung ausschalten und verbinden; die Kamera zeigt „LZ Camera Sync“ – dort bestätigen. Ohne Zugriffsauthentifizierung ist die Verbindung unverschlüsselt.

## WLAN direkt (Wi-Fi Direct)

1. An der Kamera: `MENU → Netzwerk → Verb./FB-Aufn. → Fernb.-Aufn.-Funkt. → Wi-Fi Direct-Infos` – zeigt Netzwerkname (`DIRECT-…`) und Passwort.
2. Am Mac mit diesem WLAN verbinden. Solange der Mac im Kamera-WLAN ist, hat er kein Internet.
3. In LZ Camera Sync mit der IP **192.168.122.1** verbinden, weiter wie oben.

## Was die App an der Kamera tut

- **Sichern** liest alle Einstellungen der Kamera. Steht sie in P, A oder S, schaltet die App kurz in den M-Modus derselben Familie, liest dort Verschlusszeit, ISO und Blende und schaltet zurück.
- **Angleichen** schreibt das globale Setup und auf Wunsch die Uhrzeit.
- **Zurückgeben** schreibt die gesicherten Einstellungen zurück; Werte aus dem M-Modus im M-Modus, danach steht die Kamera wieder in ihrem eigenen Modus.
- **Nie geschrieben** werden Tasten-Funktionen und die Position von Zoom und Fokus – eine Kamera am Rig fährt dabei nicht.

## Uhrzeit

- Die App sendet die Uhrzeit des Rechners mit Zeitzone. Das Menü für Datum und Uhrzeit an der Kamera muss dabei geschlossen sein.
- Manche Modelle nehmen keine Zeitzone an. Dann die Kamera im Menü auf **GMT** stellen und in der App **als UTC** einschalten.

## Quellen

Sony Hilfe-Handbücher (deutsch, PDF): [FX3](https://helpguide.sony.net/ilc/2210/v1/de/print.pdf) · [A7 IV](https://helpguide.sony.net/ilc/2110/v1/de/print.pdf). Englisch: [FX3 Remote Shoot Function](https://helpguide.sony.net/ilc/2210/v1/en/contents/TP1000884035.html) · [FX3 WLAN-Info](https://helpguide.sony.net/ilc/2210/v1/en/contents/TP1000884194.html) · [FX3 mit Router verbinden](https://helpguide.sony.net/promobile/mc/v1/en/contents/connecting_access_point_fx3.html) · [A7 IV Remote Shoot Function](https://helpguide.sony.net/ilc/2110/v1/en/contents/TP1000656591.html) · [A7 IV Access Authen. Settings](https://helpguide.sony.net/ilc/2110/v1/en/contents/TP1000954812.html). Verbindungsdetails (SSH, Port, Uhrzeitformat): Sony *Camera Control PTP 3 Reference*.
