// Beim Wechsel des Hoehenbereichs andere Filter behalten und den alten Hoehenwert ersetzen.
document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[data-tp-flor-navigation]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const destination = new URL(link.href);
  const heightParameter = 'filter.p.m.custom.florhoehe_mm';
  const currentParameters = new URLSearchParams(window.location.search);

  for (const key of [...destination.searchParams.keys()]) {
    if (key.startsWith('filter.') || key === 'page' || key === 'sort_by') destination.searchParams.delete(key);
  }
  if (link.dataset.tpFlorClear !== 'true') destination.searchParams.set(heightParameter, link.dataset.tpFlorValue);

  for (const [key, value] of currentParameters) {
    if (key.startsWith('filter.') && key !== heightParameter) destination.searchParams.append(key, value);
  }
  if (currentParameters.has('sort_by')) destination.searchParams.set('sort_by', currentParameters.get('sort_by'));

  event.preventDefault();
  window.location.assign(destination.href);
});
