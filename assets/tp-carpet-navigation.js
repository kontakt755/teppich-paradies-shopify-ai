const TP_CARPET_URLS = {
  Hochflor: '/collections/teppichboden-hochflor',
  Kurzflor: '/collections/teppichboden-kurzflor',
  Velours: '/collections/teppichboden-velours',
  Schlinge: '/collections/teppichboden-schlinge',
  Wolle: '/collections/teppichboden-wolle',
  'Nadelvlies & Objekt': '/collections/teppichboden-wolle-kopie',
};

function enhanceCarpetMenu() {
  const carpetLinks = document.querySelectorAll('.gm-item.gm-level-0 > .gm-target[title="Teppichboden"]');

  carpetLinks.forEach((carpetLink) => {
    if (carpetLink.dataset.tpCarpetNavigation === 'true') return;
    carpetLink.dataset.tpCarpetNavigation = 'true';
    carpetLink.href = '/collections/teppischboden';

    const carpetItem = carpetLink.closest('.gm-item.gm-level-0');
    const typeList = carpetItem?.querySelector('.gm-submenu .gm-grid-item:first-child .gm-links');
    if (!typeList) return;

    const allCarpetsLink = typeList.querySelector('.gm-heading .gm-target');
    if (allCarpetsLink) {
      allCarpetsLink.href = '/collections/teppischboden';
      allCarpetsLink.title = 'Alle Teppichböden ansehen';
      const text = allCarpetsLink.querySelector('.gm-text');
      if (text) text.textContent = 'Alle Teppichböden ansehen';
    }

    typeList.querySelectorAll('.gm-target').forEach((link) => {
      const label = link.querySelector('.gm-text')?.textContent.trim();
      if (label && TP_CARPET_URLS[label]) link.href = TP_CARPET_URLS[label];
    });

    const mobileLabel = carpetLink.querySelector('.gm-text');
    if (carpetLink.closest('.gm-menu-mobile') && mobileLabel && !mobileLabel.dataset.tpDirectLink) {
      mobileLabel.dataset.tpDirectLink = 'true';
      mobileLabel.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          window.location.assign('/collections/teppischboden');
        },
        true
      );
    }
  });
}

enhanceCarpetMenu();
new MutationObserver(enhanceCarpetMenu).observe(document.documentElement, { childList: true, subtree: true });
