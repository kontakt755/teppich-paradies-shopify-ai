(function () {
  var STORAGE_KEY = 'tpCompareItems';
  var MAX_ITEMS = 3;
  var COLLAPSE_DELAY = 5000;
  var collapseTimer;

  var FIELDS = [
    { key: 'pricePerSqm', label: '€/m²' },
    { key: 'belagsart', label: 'Belagsart' },
    { key: 'staerke', label: 'Stärke' },
    { key: 'nutzschicht', label: 'Nutzschicht' },
    { key: 'nutzungsklasse', label: 'Nutzungsklasse' },
    { key: 'trittschall', label: 'Trittschall' },
    { key: 'fussbodenheizung', label: 'Fußbodenheizung' },
    { key: 'feuchtraum', label: 'Feuchtraum' },
    { key: 'paketinhalt', label: 'Paketinhalt' },
  ];

  function readItems() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items : [];
    } catch (e) {
      return [];
    }
  }

  function writeItems(items) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      /* localStorage nicht verfuegbar - Vergleich bleibt in diesem Fall funktionslos, kein Fehler */
    }
  }

  function findIndex(items, handle) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].handle === handle) return i;
    }
    return -1;
  }

  function updateToggleButtons() {
    var items = readItems();
    document.querySelectorAll('[data-tp-compare-toggle]').forEach(function (btn) {
      var handle = btn.dataset.tpCompareHandle;
      var active = findIndex(items, handle) !== -1;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      // Kompakte Karten (data-tp-compare-compact) bekommen ein kurzes Label,
      // damit der Button auf Mobile nicht umbricht/abgeschnitten wird. Der
      // Button auf der Produktseite ist davon nicht betroffen und behaelt
      // seinen vollen Text.
      if (btn.hasAttribute('data-tp-compare-compact')) {
        btn.textContent = active ? 'Verglichen' : 'Vergleichen';
      } else {
        btn.textContent = active ? 'Von Vergleich entfernen' : 'Zum Vergleich hinzufügen';
      }
    });
  }

  function scheduleCollapse() {
    window.clearTimeout(collapseTimer);
    collapseTimer = window.setTimeout(function () {
      var bar = document.querySelector('[data-tp-compare-bar]');
      if (bar && !bar.hidden && readItems().length > 0) collapseBar(false);
    }, COLLAPSE_DELAY);
  }

  function expandBar(autoCollapse) {
    var bar = document.querySelector('[data-tp-compare-bar]');
    if (!bar) return;
    bar.dataset.collapsed = 'false';
    var expandButton = bar.querySelector('[data-tp-compare-expand]');
    if (expandButton) expandButton.setAttribute('aria-expanded', 'true');
    window.clearTimeout(collapseTimer);
    if (autoCollapse) scheduleCollapse();
  }

  function collapseBar(focusCompactButton) {
    var bar = document.querySelector('[data-tp-compare-bar]');
    if (!bar || bar.hidden || readItems().length === 0) return;
    window.clearTimeout(collapseTimer);
    bar.dataset.collapsed = 'true';
    var expandButton = bar.querySelector('[data-tp-compare-expand]');
    if (expandButton) {
      expandButton.setAttribute('aria-expanded', 'false');
      if (focusCompactButton) expandButton.focus();
    }
  }

  function updateBar(showExpanded) {
    var bar = document.querySelector('[data-tp-compare-bar]');
    if (!bar) return;
    var items = readItems();
    bar.querySelectorAll('[data-tp-compare-count]').forEach(function (countEl) {
      countEl.textContent = items.length;
    });
    bar.hidden = items.length === 0;
    if (items.length === 0) {
      window.clearTimeout(collapseTimer);
      bar.dataset.collapsed = 'false';
      var expandButton = bar.querySelector('[data-tp-compare-expand]');
      if (expandButton) expandButton.setAttribute('aria-expanded', 'false');
    } else if (showExpanded) {
      expandBar(true);
    } else if (!bar.dataset.collapsed) {
      bar.dataset.collapsed = 'true';
    }
  }

  function renderDialog() {
    var dialog = document.querySelector('[data-tp-compare-dialog]');
    if (!dialog) return;
    var items = readItems();
    var table = dialog.querySelector('[data-tp-compare-table]');
    if (!table) return;

    if (items.length === 0) {
      table.innerHTML = '<p>Noch keine Produkte zum Vergleich ausgewählt.</p>';
      return;
    }

    var html = '<table class="tp-compare-table"><thead><tr><th></th>';
    items.forEach(function (item) {
      // Aeltere localStorage-Eintraege (vor Einfuehrung von url/image) haben
      // diese Felder nicht. Die Produkt-URL laesst sich aus dem Handle
      // rekonstruieren, das Bild nicht - dann entfaellt es ersatzlos.
      var url = item.url || '/products/' + item.handle;
      var image = item.image
        ? '<img class="tp-compare-product__img" src="' + escapeHtml(item.image) + '" alt="" loading="lazy" width="72" height="72">'
        : '';

      html += '<th><div class="tp-compare-header-cell">' +
              '<a class="tp-compare-product" href="' + escapeHtml(url) + '">' +
              image +
              '<span>' + escapeHtml(item.title) + '</span>' +
              '</a>' +
              '<button type="button" class="tp-compare-remove-btn" data-tp-compare-remove data-tp-compare-handle="' + escapeHtml(item.handle) + '" aria-label="Produkt entfernen">×</button>' +
              '</div></th>';
    });
    html += '</tr></thead><tbody>';

    FIELDS.forEach(function (field) {
      // Zeile ueberspringen, wenn KEINES der verglichenen Produkte fuer
      // dieses Feld einen echten Wert hat (z.B. Metafeld existiert im Shop
      // nicht oder ist bei allen verglichenen Produkten leer) - eine Zeile
      // voller "–" liefert keinen Vergleichswert. Werte selbst bleiben
      // unveraendert/nicht erfunden, es wird nur die leere Zeile ausgeblendet.
      var hasAnyValue = items.some(function (item) {
        return !!item[field.key];
      });
      if (!hasAnyValue) return;

      html += '<tr><th>' + escapeHtml(field.label) + '</th>';
      items.forEach(function (item) {
        var value = item[field.key];
        html += '<td>' + (value ? escapeHtml(value) : '–') + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    table.innerHTML = html;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str);
    // textContent/innerHTML maskiert & < >, aber keine Anfuehrungszeichen.
    // Der Rueckgabewert landet auch in Attributwerten (href/src/data-*),
    // daher hier zusaetzlich maskieren.
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toggle(handle, snapshot) {
    var items = readItems();
    var idx = findIndex(items, handle);

    if (idx !== -1) {
      items.splice(idx, 1);
    } else {
      if (items.length >= MAX_ITEMS) {
        window.alert('Es können maximal ' + MAX_ITEMS + ' Produkte gleichzeitig verglichen werden. Bitte zuerst ein Produkt entfernen.');
        return;
      }
      items.push(snapshot);
    }

    writeItems(items);
    updateToggleButtons();
    updateBar(true);
    renderDialog();
  }

  document.addEventListener('click', function (event) {
    var toggleBtn = event.target.closest('[data-tp-compare-toggle]');
    if (toggleBtn) {
      var snapshot;
      try {
        snapshot = JSON.parse(toggleBtn.dataset.tpCompareSnapshot || '{}');
      } catch (e) {
        snapshot = {};
      }
      toggle(toggleBtn.dataset.tpCompareHandle, snapshot);
      return;
    }

    var openBtn = event.target.closest('[data-tp-compare-open]');
    if (openBtn) {
      var dialog = document.querySelector('[data-tp-compare-dialog]');
      if (dialog && typeof dialog.showModal === 'function') {
        renderDialog();
        dialog.showModal();
      }
      return;
    }

    var expandBtn = event.target.closest('[data-tp-compare-expand]');
    if (expandBtn) {
      expandBar(true);
      return;
    }

    var collapseBtn = event.target.closest('[data-tp-compare-collapse]');
    if (collapseBtn) {
      collapseBar(true);
      return;
    }

    var removeBtn = event.target.closest('[data-tp-compare-remove]');
    if (removeBtn) {
      var items = readItems();
      var idx = findIndex(items, removeBtn.dataset.tpCompareHandle);
      if (idx !== -1) {
        items.splice(idx, 1);
        writeItems(items);
        updateToggleButtons();
        updateBar(true);
        renderDialog();
      }
      return;
    }

    var closeBtn = event.target.closest('[data-tp-compare-close]');
    if (closeBtn) {
      var dialogToClose = document.querySelector('[data-tp-compare-dialog]');
      if (dialogToClose) dialogToClose.close();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    updateToggleButtons();
    updateBar();
  });

  if (document.readyState !== 'loading') {
    updateToggleButtons();
    updateBar();
  }
})();
