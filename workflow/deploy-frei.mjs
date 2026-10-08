#!/usr/bin/env node
// npm run -s deploy:frei - vor jedem Merge nach main (auch fuer Codex, das den
// Claude-Hook nicht hat). Exit 0: frei. Exit 1: ein Deploy laeuft, nicht mergen.
import { laufenderDeploy } from './deploy-fenster.mjs';

const deploy = laufenderDeploy();
if (deploy) {
  console.log(`BELEGT: ${deploy.grund} in ${deploy.pfad}. Nicht nach main mergen, bis Live durch ist.`);
  process.exitCode = 1;
} else {
  console.log('FREI: kein Deploy laeuft, Merge nach main ist moeglich.');
}
