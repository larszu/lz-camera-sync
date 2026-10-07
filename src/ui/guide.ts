/**
 * The camera setup guide shown in the app (same content as
 * docs/kamera-einrichten.md). Menu names exactly as the camera shows them,
 * taken from Sony's help guides for FX3 (2210) and A7 IV (2110). Each step
 * links the Sony page — the menu screenshots stay Sony's, on Sony's site.
 */

export type Model = 'fx3' | 'a7iv'
export type Way = 'usb' | 'router' | 'mac' | 'direct'
export type Topic = 'remote' | 'usbMode' | 'connectPc' | 'wifiConnect' | 'accessPoint' | 'wifiInfo' | 'authSettings' | 'authInfo' | 'wifiDirect'

const MANUAL: Record<Model, { id: string; pages: Record<'de' | 'en', Record<Topic, string>> }> = {
  fx3: {
    id: '2210',
    pages: {
      de: {
        remote: 'TP1000884468', usbMode: 'TP1000845511', connectPc: 'TP1000845921', wifiConnect: 'TP1001275383', accessPoint: 'TP1000845914',
        wifiInfo: 'TP1000884466', authSettings: 'TP1001108512', authInfo: 'TP1001108511', wifiDirect: 'TP1001804330',
      },
      en: {
        remote: 'TP1000884035', usbMode: 'TP1000843988', connectPc: 'TP1000843973', wifiConnect: 'TP1001273516', accessPoint: 'TP1000843952',
        wifiInfo: 'TP1000884194', authSettings: 'TP1001106326', authInfo: 'TP1001106325', wifiDirect: 'TP1001690664',
      },
    },
  },
  a7iv: {
    id: '2110',
    pages: {
      de: {
        remote: 'TP1000657024', usbMode: 'TP1000618067', connectPc: 'TP1000618477', wifiConnect: 'TP1001106180', accessPoint: 'TP1000618470',
        wifiInfo: 'TP1000657022', authSettings: 'TP1001106178', authInfo: 'TP1001106177', wifiDirect: 'TP1001849684',
      },
      en: {
        remote: 'TP1000656591', usbMode: 'TP1000616544', connectPc: 'TP1000616529', wifiConnect: 'TP1000954814', accessPoint: 'TP1000616508',
        wifiInfo: 'TP1000656750', authSettings: 'TP1000954812', authInfo: 'TP1000954811', wifiDirect: 'TP1001803631',
      },
    },
  },
}

export function sonyPage(model: Model, lang: 'de' | 'en', topic: Topic): string {
  const m = MANUAL[model]
  return `https://helpguide.sony.net/ilc/${m.id}/v1/${lang}/contents/${m.pages[lang][topic]}.html`
}

type Text = { de: string; en: string }

export interface Step {
  title: Text
  /** Menu path as the camera shows it; the last entry is the value to pick. */
  menu?: { de: string[]; en: string[] }
  text?: Text
  /** Where: on the camera, the computer, or in this app. */
  where: 'camera' | 'mac' | 'app'
  topic?: Topic
}

const REMOTE_ON: Step = {
  where: 'camera',
  title: { de: 'Fernbedienung einschalten', en: 'Switch on remote shooting' },
  menu: {
    de: ['Netzwerk', 'Verb./FB-Aufn.', 'Fernb.-Aufn.-Funkt.', 'Fernbed.-Aufn.', 'Ein'],
    en: ['Network', 'Cnct./Remote Sht.', 'Remote Shoot Function', 'Remote Shooting', 'On'],
  },
  text: { de: 'Kein Smartphone mit der Kamera verbunden lassen – sonst lässt sie sich nicht vom Rechner steuern.', en: 'Keep no smartphone connected — otherwise the camera cannot be controlled from a computer.' },
  topic: 'remote',
}

const AUTH_INFO: Step = {
  where: 'camera',
  title: { de: 'Benutzer, Passwort und Fingerabdruck ablesen', en: 'Read user, password and fingerprint' },
  menu: { de: ['Netzwerk', 'Netzwerkoption', 'ZugriffAuthent.-Infos'], en: ['Network', 'Network Option', 'Access Authen. Info'] },
  text: {
    de: 'Die Zugriffsauthentifizierung ist ab Werk an, Benutzer und Passwort sind ab Werk vergeben. Ändern unter Netzwerkoption → ZugrAuthent.Einstlg.',
    en: 'Access Authentication is on from the factory; user and password are set at the factory. Change them under Network Option → Access Authen. Settings.',
  },
  topic: 'authInfo',
}

const APP_WIFI: Step = {
  where: 'app',
  title: { de: 'In der App auf „Verbinden“', en: 'In the app: "Connect"' },
  text: {
    de: 'Die App findet die Kamera von selbst unter „Kameras in diesem Netz“. Beim ersten Mal einmal Benutzer und Passwort eingeben und den Fingerabdruck bestätigen – danach reicht ein Klick.',
    en: 'The app finds the camera by itself under "Cameras on this network". The first time, enter user and password once and confirm the fingerprint — after that one click is enough.',
  },
}

const NO_PASSWORD: Step = {
  where: 'camera',
  title: { de: 'Optional: ganz ohne Passwort', en: 'Optional: no password at all' },
  menu: { de: ['Netzwerk', 'Netzwerkoption', 'ZugrAuthent.Einstlg.', 'Zugriffsauthentif.', 'Aus'], en: ['Network', 'Network Option', 'Access Authen. Settings', 'Access Authen.', 'Off'] },
  text: {
    de: 'Dann fragt die Kamera beim ersten Verbinden einmal „Kopplung erlauben?“ und merkt sich diesen Rechner. Die Verbindung ist dann unverschlüsselt – im eigenen Netz meist in Ordnung, im fremden nicht.',
    en: 'The camera then asks once "Allow pairing?" on the first connection and remembers this computer. The connection is then not encrypted — usually fine on your own network, not on a foreign one.',
  },
  topic: 'authSettings',
}

export const WAYS: Record<Way, Step[]> = {
  usb: [
    REMOTE_ON,
    {
      where: 'camera',
      title: { de: 'USB-Modus auf Fernaufnahme', en: 'USB mode to remote shooting' },
      menu: { de: ['Einstellung', 'USB', 'USB-Verbind.modus', 'Fernbed.-Aufn.'], en: ['Setup', 'USB', 'USB Connection Mode', 'Remote Shooting'] },
      text: { de: 'Oder beim Einstecken in der Auswahl der Kamera „Fernbed.-Aufn.“ wählen. Nicht „Bildübertragung (MSC/MTP)“.', en: 'Or choose "Remote Shooting" in the camera\'s prompt when plugging in. Not "Mass Storage"/"MTP".' },
      topic: 'usbMode',
    },
    {
      where: 'mac',
      title: { de: 'Mit einem Datenkabel anstecken', en: 'Plug in with a data cable' },
      text: {
        de: 'Reine Ladekabel übertragen keine Daten. Am Mac Imaging Edge, Capture One, Lightroom und „Digitale Bilder“ beenden; im Terminal „killall ptpcamerad“. Unter Windows einmalig den WinUSB-Treiber (Zadig).',
        en: 'Charge-only cables carry no data. On a Mac quit Imaging Edge, Capture One, Lightroom and Image Capture; in Terminal run "killall ptpcamerad". On Windows install the WinUSB driver once (Zadig).',
      },
      topic: 'connectPc',
    },
    { where: 'app', title: { de: 'In der App „USB-Kameras suchen“', en: 'In the app: "Find USB cameras"' } },
  ],
  router: [
    REMOTE_ON,
    {
      where: 'camera',
      title: { de: 'WLAN einschalten', en: 'Switch on Wi-Fi' },
      menu: { de: ['Netzwerk', 'Wi-Fi', 'Wi-Fi-Verbindung', 'Ein'], en: ['Network', 'Wi-Fi', 'Wi-Fi Connect', 'On'] },
      topic: 'wifiConnect',
    },
    {
      where: 'camera',
      title: { de: 'Mit dem Router verbinden', en: 'Join the router' },
      menu: { de: ['Netzwerk', 'Wi-Fi', 'Zugriffspkt.-Einstlg.'], en: ['Network', 'Wi-Fi', 'Access Point Set.'] },
      text: { de: 'WLAN wählen, Passwort eingeben. Oder „WPS-Tastendruck“, wenn der Router WPS kann. Kein Gäste-WLAN.', en: 'Pick the network, enter its password. Or "WPS Push" if the router supports WPS. No guest network.' },
      topic: 'accessPoint',
    },
    AUTH_INFO,
    {
      where: 'mac',
      title: { de: 'Mac ins selbe WLAN', en: 'Mac on the same network' },
      text: {
        de: 'Fragt macOS, ob LZ Camera Sync Geräte im lokalen Netzwerk finden darf: Erlauben (später unter Datenschutz & Sicherheit → Lokales Netzwerk).',
        en: 'When macOS asks whether LZ Camera Sync may find devices on the local network: Allow (later under Privacy & Security → Local Network).',
      },
    },
    APP_WIFI,
    NO_PASSWORD,
  ],
  mac: [
    {
      where: 'mac',
      title: { de: 'Mac als WLAN-Hotspot einschalten', en: 'Turn the Mac into a Wi-Fi hotspot' },
      text: {
        de: 'Systemeinstellungen → Allgemein → Teilen → Internetfreigabe. „Verbindung freigeben von“: Ethernet, USB-LAN oder iPhone-USB. „Mit anderen Geräten über“: WLAN. Unter „WLAN-Optionen“ Netzwerkname und Passwort festlegen, dann einschalten. Der Mac braucht dafür eine zweite Verbindung (Kabel); sein WLAN wird zum Hotspot.',
        en: 'System Settings → General → Sharing → Internet Sharing. "Share your connection from": Ethernet, USB LAN or iPhone USB. "To devices using": Wi-Fi. Set network name and password under "Wi-Fi Options", then switch it on. The Mac needs a second connection (cable) for this; its Wi-Fi becomes the hotspot.',
      },
    },
    REMOTE_ON,
    {
      where: 'camera',
      title: { de: 'WLAN einschalten', en: 'Switch on Wi-Fi' },
      menu: { de: ['Netzwerk', 'Wi-Fi', 'Wi-Fi-Verbindung', 'Ein'], en: ['Network', 'Wi-Fi', 'Wi-Fi Connect', 'On'] },
      topic: 'wifiConnect',
    },
    {
      where: 'camera',
      title: { de: 'Mit dem WLAN des Macs verbinden', en: 'Join the Mac\'s network' },
      menu: { de: ['Netzwerk', 'Wi-Fi', 'Zugriffspkt.-Einstlg.'], en: ['Network', 'Wi-Fi', 'Access Point Set.'] },
      text: { de: 'Den Netzwerknamen aus der Internetfreigabe wählen, Passwort eingeben. Alle Kameras können so ins selbe Mac-WLAN.', en: 'Pick the network name from Internet Sharing, enter its password. All cameras can join the same Mac network.' },
      topic: 'accessPoint',
    },
    AUTH_INFO,
    APP_WIFI,
    NO_PASSWORD,
  ],
  direct: [
    REMOTE_ON,
    {
      where: 'camera',
      title: { de: 'Netzwerkname und Passwort der Kamera ablesen', en: 'Read the camera\'s network name and password' },
      menu: { de: ['Netzwerk', 'Verb./FB-Aufn.', 'Fernb.-Aufn.-Funkt.', 'Wi-Fi Direct-Infos'], en: ['Network', 'Cnct./Remote Sht.', 'Remote Shoot Function', 'Wi-Fi Direct Info.'] },
      topic: 'wifiDirect',
    },
    {
      where: 'mac',
      title: { de: 'Mac mit dem Kamera-WLAN verbinden', en: 'Join the camera\'s network on the Mac' },
      text: { de: 'Das WLAN heißt „DIRECT-…“. Solange der Mac darin ist, hat er kein Internet.', en: 'The network is called "DIRECT-…". While on it, the Mac has no internet.' },
    },
    AUTH_INFO,
    { ...APP_WIFI, text: { de: 'IP-Adresse 192.168.122.1. ' + APP_WIFI.text!.de.replace('IP-Adresse eintragen, ', ''), en: 'IP address 192.168.122.1. ' + APP_WIFI.text!.en.replace('enter the IP address, ', '') } },
  ],
}
