


(function (G) {
  'use strict';
  var D = G.document;
  var ITEMS = [
    ['agnOperationalHandoverButton', 'Operational handover'],
    ['backendSequenceBtn',           'Backend sequence'],
    ['agnIntegrationBtn',            'Integration'],
    ['agnProviderBtn',               'Providers'],
    ['agnQueueBtn',                  'Queue'],
    ['agnGovernanceBtn',             'Governance'],
    ['agnNationalArchiveBtn',        'National archive'],
    ['agnQualityButton',             'Quality'],
    ['agnStagingAcceptanceButton',   'Staging acceptance'],
    ['agnEnterpriseSecurityButton',  'Enterprise security'],
    ['agnUrbanHeatButton',           'Urban heat']
  ];
  function build() {
    var bar = D.querySelector('.topbar');
    if (!bar) return setTimeout(build, 600);
    if (D.getElementById('agnConsoleMenu')) return;
    var present = ITEMS.filter(function (it) { return !!D.getElementById(it[0]); });
    if (!present.length) return setTimeout(build, 600);

    var wrap = D.createElement('div');
    wrap.className = 'agn-console-menu';
    wrap.id = 'agnConsoleMenu';

    var btn = D.createElement('button');
    btn.type = 'button';
    btn.id = 'agnConsoleMenuBtn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'agnConsoleDrawer');
    

    btn.textContent = 'Consoles ';
    var cnt = D.createElement('span');
    cnt.className = 'agn-console-count';
    cnt.textContent = '(' + present.length + ')';
    btn.appendChild(cnt);
    btn.setAttribute('aria-label',
      'Consoles — ' + present.length + ' operational, integration and governance consoles');
    btn.title = 'Operational, integration and governance consoles';

    var drawer = D.createElement('div');
    drawer.className = 'agn-console-drawer';
    drawer.id = 'agnConsoleDrawer';
    drawer.setAttribute('role', 'menu');
    drawer.setAttribute('aria-labelledby', 'agnConsoleMenuBtn');

    present.forEach(function (it) {
      var item = D.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.dataset.agnConsoleTarget = it[0];
      item.textContent = it[1];
      item.addEventListener('click', function () {
        

        drawer.removeAttribute('data-open');
        btn.setAttribute('aria-expanded', 'false');
        var t = D.getElementById(it[0]);
        if (!t) { btn.focus(); return; }
        try { t.click(); } catch (_) { try { if (typeof t.onclick === 'function') t.onclick(); } catch (__) {} }
        setTimeout(function () {
          try {
            var dlgs = [].slice.call(D.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"]'))
              .filter(function (d2) {
                var cs = G.getComputedStyle(d2);
                return cs.display !== 'none' && cs.visibility !== 'hidden';
              });
            var dlg = dlgs[dlgs.length - 1];
            if (!dlg) { btn.focus(); return; }
            var f = dlg.querySelector('[autofocus]')
                 || dlg.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
            (f || dlg).focus();
          } catch (_) { try { btn.focus(); } catch (__) {} }
        }, 260);
      });
      drawer.appendChild(item);
    });

    function open() {
      drawer.setAttribute('data-open', '1');
      btn.setAttribute('aria-expanded', 'true');
      clampIntoView();
      var first = drawer.querySelector('button');
      if (first) first.focus();
    }
    

    function clampIntoView() {
      try {
        drawer.style.transform = '';
        var r = drawer.getBoundingClientRect();
        var pad = 8, dx = 0;
        if (r.left < pad) dx = pad - r.left;
        else if (r.right > G.innerWidth - pad) dx = (G.innerWidth - pad) - r.right;
        if (dx) drawer.style.transform = 'translateX(' + Math.round(dx) + 'px)';
      } catch (_) {}
    }
    try { G.addEventListener('resize', function () {
      if (drawer.getAttribute('data-open') === '1') clampIntoView(); }); } catch (_) {}
    function close() {
      drawer.removeAttribute('data-open');
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', function () {
      if (drawer.getAttribute('data-open') === '1') { close(); btn.focus(); } else open();
    });
    D.addEventListener('click', function (ev) {
      if (!wrap.contains(ev.target) && drawer.getAttribute('data-open') === '1') close();
    }, true);
    

    drawer.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); btn.focus(); return; }
      var items = [].slice.call(drawer.querySelectorAll('button'));
      var i = items.indexOf(D.activeElement);
      if (ev.key === 'ArrowDown') { ev.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (ev.key === 'ArrowUp')   { ev.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      if (ev.key === 'Tab') {
        ev.preventDefault();
        var next = ev.shiftKey ? (items[i - 1] || items[items.length - 1])
                               : (items[i + 1] || items[0]);
        next.focus();
      }
    });
    D.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (drawer.getAttribute('data-open') !== '1') return;
      close(); btn.focus();
    });

    wrap.appendChild(btn);
    wrap.appendChild(drawer);
    bar.appendChild(wrap);
    try { G.AGN = G.AGN || {}; G.AGN.consoleMenu = {
      items: present.map(function (x) { return { id: x[0], label: x[1] }; }),
      open: open, close: close }; } catch (_) {}
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function(){ setTimeout(build, 800); });
  else setTimeout(build, 800);
})(window);
