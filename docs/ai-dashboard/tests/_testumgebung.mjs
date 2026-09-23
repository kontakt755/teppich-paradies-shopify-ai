// Muss als ERSTER Import in jedem Servertest stehen.
//
// Der Server liest den privaten Ordner ($TP_PRIVAT_DIR) beim Laden des Moduls -
// unter anderem, ob dort ein Dashboard-Passwort liegt. Eine Zuweisung im
// Testkoerper kaeme zu spaet, weil ESM alle Importe vorher ausfuehrt: der Test
// wuerde dann gegen ~/teppich-paradies-analyse des jeweiligen Rechners laufen
// und je nach Maschine anders ausfallen (mit Passwort verlangt jede Route eine
// Anmeldung und liefert die Anmeldeseite statt der erwarteten Antwort).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PRIVAT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-dashboard-test-'));
process.env.TP_PRIVAT_DIR = PRIVAT_DIR;
delete process.env.TP_DASHBOARD_PASSWORT;
