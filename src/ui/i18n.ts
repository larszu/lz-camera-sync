// Source language en, German as first translation (house rule of the AV tools).
// `{name}` placeholders are filled by t(key, vars).
const en = {
  appName: 'Camera Sync',
  menu: 'Menu',
  close: 'Close',

  // Job track
  step_connect: 'Connect',
  step_backup: 'Back up',
  step_push: 'Align',
  step_restore: 'Give back',
  jobProgress: 'Job {pct} %',

  cams_one: '1 camera',
  cams_other: '{n} cameras',

  // Next action
  connectKicker: 'Step 1 · Connect',
  connectTitle: 'Bring the cameras in',
  connectText: 'On the camera: MENU → Network → Cnct./Remote Sht. → Remote Shoot Function → Remote Shooting → On. Then plug it in over USB or connect over Wi-Fi.',
  searchUsb: 'Find USB cameras',
  viaWifi: 'Connect over Wi-Fi',
  demo: 'Try it with 3 simulated cameras',
  noHost: 'In the browser there is no USB or Wi-Fi — the desktop app can. The simulated cameras work everywhere.',
  usbMissing: 'The USB module is not installed in this build.',
  usbNone: 'No Sony camera found on USB. Data cable? "Remote Shooting" chosen on the camera?',

  backupKicker: 'Step 2 · Back up',
  backupTitle: 'Back up {cams}',
  backupText: 'Each camera remembers how its operator set it up. That is what it gets back at the end.',
  backupGo: 'Back up now',

  pushKicker: 'Step 3 · Align',
  pushTitle: 'One look for every camera',
  pushPick: 'Tap the camera that is set up right — or use a saved setup.',
  pushFrom: 'From {name} to {cams}',
  pushGo: 'Align now',
  template: 'Template',
  makeTemplate: 'Use as template',
  savedSetup: 'Saved setup',
  orSaved: 'or a saved setup',
  carries: 'Carries',
  withClock: 'Set the clock',
  clockUtc: 'as UTC',

  restoreKicker: 'Step 4 · Give back',
  restoreTitle: 'Job done? Give the cameras back',
  restoreText: 'Every camera gets its own settings back, exactly as backed up.',
  restoreGo: 'Give back now',

  doneKicker: 'Job complete',
  doneTitle: 'All {cams} back with their operators.',
  doneTitleOne: 'The camera is back with its operator.',
  addSim: 'Add a simulated FX3',
  doneStats: '{written} settings written · clock set on {clocks}',
  newJob: 'Start a new job',

  attention: '{name}: {n} to check — open the camera',

  // Tiles
  addCamera: 'Add camera',
  simulated: 'SIMULATED',
  noOperator: 'Who has it?',
  pip_backup: 'Backed up',
  pip_push: 'Aligned',
  pip_restore: 'Given back',
  working_backup: 'Backing up…',
  working_push: 'Aligning…',
  working_restore: 'Giving back…',
  ok: 'All good',
  problems: 'Check',

  // Camera sheet
  label: 'Name',
  operator: 'Operator',
  model: 'Model',
  serial: 'Serial',
  connection: 'Connection',
  lastBackup: 'Private backup',
  never: 'none yet',
  disconnect: 'Disconnect',
  report: 'Last run',
  applied: 'written',
  unchanged: 'already right',
  skipped: 'not offered by this body',
  failed: 'refused',
  mismatched: 'camera shows another value',
  clockOk: 'clock set',
  clockFailed: 'clock refused',
  setting: 'Setting',
  private: 'Private',
  current: 'Now',
  global: 'Global',

  // Operator sheet
  whoHasIt: 'Who works with {name}?',
  nobody: 'Nobody',
  newOperator: 'New operator',
  add: 'Add',

  // Connect sheet
  ipPlaceholder: 'Camera IP, e.g. 192.168.122.1',
  connect: 'Connect',
  wifiUnreachable: 'No camera answers at {ip}. Same Wi-Fi as the camera? Remote Shooting on?',
  accessAuth: 'Access Authentication on the camera',
  sshUser: 'User',
  sshPassword: 'Password',
  pairingHint: 'Without Access Authentication: open Remote Shoot Function → Pairing on the camera; it then asks for "LZ Camera Sync" — confirm there.',
  sshAuthFailed: 'The camera at {ip} refused user or password.',
  sshMissing: 'The SSH module is not installed in this build.',
  fpTitle: 'Is this the camera?',
  fpChangedTitle: 'The camera key has changed',
  fpText: 'Compare with the fingerprint on the camera: MENU → Network → Network Option → Access Authen. Info. Connect only if they match.',
  fpChangedText: 'This IP answered with a different key than last time. That happens after a camera reset — or when another device poses as the camera. Compare with the camera menu.',
  fpConfirm: 'Matches — connect',
  cancel: 'Cancel',
  viaModeNote: '{n} written in the M mode, camera back in its own mode',

  // Menu
  appearance: 'Appearance',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  setups: 'Saved setups',
  noSetups: 'None yet. Every alignment saves one.',
  remove: 'Remove',
  data: 'Data',
  export: 'Export',
  import: 'Import',
  operators: 'Operators',

  group_exposure: 'Exposure',
  group_whiteBalance: 'White balance',
  group_picture: 'Picture profile',
  group_movie: 'Movie format',
  group_focus: 'Focus',
  group_body: 'Stabiliser',
  group_other: 'Everything else',
}

export type Key = keyof typeof en

const de: Record<Key, string> = {
  appName: 'Camera Sync',
  menu: 'Menü',
  close: 'Schließen',

  step_connect: 'Verbinden',
  step_backup: 'Sichern',
  step_push: 'Angleichen',
  step_restore: 'Zurückgeben',
  jobProgress: 'Job {pct} %',

  cams_one: '1 Kamera',
  cams_other: '{n} Kameras',

  connectKicker: 'Schritt 1 · Verbinden',
  connectTitle: 'Kameras dazuholen',
  connectText: 'An der Kamera MENU → Netzwerk → Verb./FB-Aufn. → Fernb.-Aufn.-Funkt. → Fernbed.-Aufn. → Ein. Dann per USB anstecken oder über WLAN verbinden.',
  searchUsb: 'USB-Kameras suchen',
  viaWifi: 'Über WLAN verbinden',
  demo: 'Mit 3 simulierten Kameras ausprobieren',
  noHost: 'Im Browser gibt es kein USB und kein WLAN – die Desktop-App kann das. Die simulierten Kameras gehen überall.',
  usbMissing: 'Das USB-Modul fehlt in diesem Build.',
  usbNone: 'Keine Sony-Kamera am USB gefunden. Datenkabel? An der Kamera „Fernbed.-Aufn.“ gewählt?',

  backupKicker: 'Schritt 2 · Sichern',
  backupTitle: '{cams} sichern',
  backupText: 'Jede Kamera merkt sich, wie ihr Bediener sie eingestellt hat. Genau das bekommt sie am Ende zurück.',
  backupGo: 'Jetzt sichern',

  pushKicker: 'Schritt 3 · Angleichen',
  pushTitle: 'Ein Look für alle Kameras',
  pushPick: 'Tippe auf die Kamera, die richtig eingestellt ist – oder nimm ein gespeichertes Setup.',
  pushFrom: 'Von {name} auf {cams}',
  pushGo: 'Jetzt angleichen',
  template: 'Vorlage',
  makeTemplate: 'Als Vorlage nehmen',
  savedSetup: 'Gespeichertes Setup',
  orSaved: 'oder ein gespeichertes Setup',
  carries: 'Übernimmt',
  withClock: 'Uhrzeit setzen',
  clockUtc: 'als UTC',

  restoreKicker: 'Schritt 4 · Zurückgeben',
  restoreTitle: 'Job vorbei? Kameras zurückgeben',
  restoreText: 'Jede Kamera bekommt ihre eigenen Einstellungen zurück, genau wie gesichert.',
  restoreGo: 'Jetzt zurückgeben',

  doneKicker: 'Job abgeschlossen',
  doneTitle: 'Alle {cams} sind zurück bei ihren Bedienern.',
  doneTitleOne: 'Die Kamera ist zurück bei ihrem Bediener.',
  addSim: 'Simulierte FX3 hinzufügen',
  doneStats: '{written} Einstellungen geschrieben · Uhrzeit auf {clocks} gesetzt',
  newJob: 'Neuen Job starten',

  attention: '{name}: {n} prüfen – Kamera öffnen',

  addCamera: 'Kamera hinzufügen',
  simulated: 'SIMULIERT',
  noOperator: 'Wer hat sie?',
  pip_backup: 'Gesichert',
  pip_push: 'Angeglichen',
  pip_restore: 'Zurückgegeben',
  working_backup: 'Sichert…',
  working_push: 'Gleicht an…',
  working_restore: 'Gibt zurück…',
  ok: 'Alles gut',
  problems: 'Prüfen',

  label: 'Name',
  operator: 'Bediener',
  model: 'Modell',
  serial: 'Seriennummer',
  connection: 'Verbindung',
  lastBackup: 'Private Sicherung',
  never: 'noch keine',
  disconnect: 'Trennen',
  report: 'Letzter Lauf',
  applied: 'geschrieben',
  unchanged: 'schon richtig',
  skipped: 'bietet dieses Gehäuse nicht an',
  failed: 'abgelehnt',
  mismatched: 'Kamera zeigt anderen Wert',
  clockOk: 'Uhrzeit gesetzt',
  clockFailed: 'Uhrzeit abgelehnt',
  setting: 'Einstellung',
  private: 'Privat',
  current: 'Jetzt',
  global: 'Global',

  whoHasIt: 'Wer arbeitet mit {name}?',
  nobody: 'Niemand',
  newOperator: 'Neuer Bediener',
  add: 'Hinzufügen',

  ipPlaceholder: 'Kamera-IP, z. B. 192.168.122.1',
  connect: 'Verbinden',
  wifiUnreachable: 'Unter {ip} antwortet keine Kamera. Gleiches WLAN wie die Kamera? Fernbed.-Aufn. an?',
  accessAuth: 'Zugriffsauthentifizierung an der Kamera',
  sshUser: 'Benutzer',
  sshPassword: 'Passwort',
  pairingHint: 'Ohne Zugriffsauthentifizierung: an der Kamera Fernb.-Aufn.-Funkt. → Kopplung aufrufen; sie fragt dann nach „LZ Camera Sync“ – dort bestätigen.',
  sshAuthFailed: 'Die Kamera unter {ip} hat Benutzer oder Passwort abgelehnt.',
  sshMissing: 'Das SSH-Modul fehlt in diesem Build.',
  fpTitle: 'Ist das die Kamera?',
  fpChangedTitle: 'Der Schlüssel der Kamera hat sich geändert',
  fpText: 'Mit dem Fingerabdruck an der Kamera vergleichen: MENU → Netzwerk → Netzwerkoption → ZugriffAuthent.-Infos. Nur verbinden, wenn er übereinstimmt.',
  fpChangedText: 'Diese IP antwortet mit einem anderen Schlüssel als beim letzten Mal. Das passiert nach einem Reset der Kamera – oder wenn sich ein anderes Gerät als Kamera ausgibt. Mit dem Kameramenü vergleichen.',
  fpConfirm: 'Stimmt überein – verbinden',
  cancel: 'Abbrechen',
  viaModeNote: '{n} im M-Modus geschrieben, Kamera wieder im eigenen Modus',

  appearance: 'Darstellung',
  themeSystem: 'System',
  themeLight: 'Hell',
  themeDark: 'Dunkel',
  setups: 'Gespeicherte Setups',
  noSetups: 'Noch keine. Jedes Angleichen speichert eins.',
  remove: 'Entfernen',
  data: 'Daten',
  export: 'Exportieren',
  import: 'Importieren',
  operators: 'Bediener',

  group_exposure: 'Belichtung',
  group_whiteBalance: 'Weißabgleich',
  group_picture: 'Bildprofil',
  group_movie: 'Movie-Format',
  group_focus: 'Fokus',
  group_body: 'Stabilisator',
  group_other: 'Alles Übrige',
}

const lang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
const table: Record<Key, string> = lang === 'de' ? de : en

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return table[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

/** "1 Kamera" / "3 Kameras" */
export function cams(n: number): string {
  return t(n === 1 ? 'cams_one' : 'cams_other', { n })
}

export const locale = lang === 'de' ? 'de-DE' : 'en-GB'

// Readable names for the settings shown in the camera sheet; the rest keep
// libgphoto2's identifier.
const PROP_LABELS: Record<number, [string, string]> = {
  0x500e: ['Exposure mode', 'Belichtungsmodus'],
  0xd001: ['Iris mode', 'Blendenmodus'],
  0x5007: ['Aperture', 'Blende'],
  0xd20d: ['Shutter', 'Verschlusszeit'],
  0xd21e: ['ISO', 'ISO'],
  0xd226: ['ISO (2)', 'ISO (2)'],
  0x5010: ['Exposure comp.', 'Belichtungskorrektur'],
  0xd224: ['Exposure comp.', 'Belichtungskorrektur'],
  0x500b: ['Metering', 'Messmethode'],
  0x5005: ['White balance', 'Weißabgleich'],
  0xd20f: ['Colour temperature', 'Farbtemperatur'],
  0xd210: ['WB shift G/M', 'WB-Verschiebung G/M'],
  0xd21c: ['WB shift A/B', 'WB-Verschiebung A/B'],
  0xd23f: ['Picture profile', 'Bildprofil'],
  0xd240: ['Creative look', 'Kreativ-Look'],
  0xd201: ['DRO', 'DRO'],
  0xd200: ['DRO level', 'DRO-Stufe'],
  0xd241: ['Movie file format', 'Movie-Dateiformat'],
  0xd242: ['Movie recording', 'Movie-Aufnahme'],
  0x500a: ['Focus mode', 'Fokusmodus'],
  0xd007: ['Focus mode (2)', 'Fokusmodus (2)'],
  0xd22c: ['Focus area', 'Fokusfeld'],
  0xd255: ['AF tracking', 'AF-Verfolgung'],
  0xd0d9: ['Stabiliser', 'Stabilisator'],
  0xd0db: ['Silent mode', 'Lautlos'],
  0xd0df: ['Shutter type', 'Verschlussart'],
}

export function propLabel(code: number, fallback: string): string {
  const l = PROP_LABELS[code]
  return l ? l[lang === 'de' ? 1 : 0] : fallback
}
