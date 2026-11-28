/**
 * Knopf "Nach oben" auf langen Seiten (Bestellen, Packstation, Kunden sind am Handy bis zu
 * 20.000 px hoch): erscheint erst nach etwa anderthalb Bildschirmhoehen, sitzt ueber der
 * Handyleiste und ist ausserhalb von #main - kein Neuzeichnen, kein Zustand.
 */
export const ZEIGEN_AB_BILDSCHIRMEN = 1.5;

/** Reine Regel, damit sie ohne Browser pruefbar ist. */
export function sollZeigen(scrollY, fensterHoehe, dialogOffen = false) {
  return !dialogOffen && fensterHoehe > 0 && scrollY > fensterHoehe * ZEIGEN_AB_BILDSCHIRMEN;
}

export function starteNachOben(doc = document, win = window) {
  if (doc.getElementById('nachOben')) return;
  const knopf = doc.createElement('button');
  knopf.type = 'button'; knopf.id = 'nachOben'; knopf.className = 'nach-oben no-print'; knopf.hidden = true;
  knopf.setAttribute('aria-label', 'Nach oben');
  knopf.innerHTML = '<svg class="nav-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6 11.500 12 5.500l6 6"/></svg><span>Nach oben</span>';
  doc.body.append(knopf);
  let geplant = false;
  const pruefe = () => {
    geplant = false;
    knopf.hidden = !sollZeigen(win.scrollY, win.innerHeight, !!doc.querySelector('#dialogRoot > *, #sheetRoot > *, #paletteRoot > *'));
  };
  win.addEventListener('scroll', () => { if (!geplant) { geplant = true; win.requestAnimationFrame(pruefe); } }, { passive: true });
  knopf.addEventListener('click', () => {
    const ruhig = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    win.scrollTo({ top: 0, behavior: ruhig ? 'auto' : 'smooth' });
    doc.getElementById('main')?.focus({ preventScroll: true });
  });
}
