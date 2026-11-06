


(function (G) {
  'use strict';
  var D = G.document, AGN = G.AGN = G.AGN || {};
  AGN.ui = AGN.ui || {};
  var DECLARED = new Map();

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  

  function mark(it) {
    if (it.symbol) return '<i class="agn-leg-sym" aria-hidden="true">' + esc(it.symbol) + '</i>';
    if (it.line) {
      return '<i class="agn-leg-line" aria-hidden="true" style="border-top-style:'
        + esc(it.line) + ';border-top-color:' + esc(it.color || '#0C3851') + '"></i>';
    }
    return '<i aria-hidden="true" style="background:' + esc(it.color || '#e5ebf0') + '"></i>';
  }

  function legend(spec) {
    spec = spec || {};
    var items = Array.isArray(spec.items) ? spec.items.filter(Boolean) : [];
    var head = spec.title
      ? '<div class="t">' + esc(spec.title)
        + (spec.unit ? ' <span class="agn-leg-unit">' + esc(spec.unit) + '</span>' : '')
        + '</div>'
      : '';
    if (!items.length) {
      return head + '<div class="agn-leg-row agn-leg-note">'
        + esc(spec.noKeyWhy || 'This visual has no key in this build, so its colours cannot '
              + 'be read from here. That is a gap in the build, not a property of the data.')
        + '</div>';
    }
    var html = head;
    items.forEach(function (it) {
      html += '<div class="agn-leg-row' + (it.absent ? ' agn-leg-absent' : '') + '">'
        + mark(it) + '<b>' + esc(it.label) + '</b>'
        + (it.range != null && it.range !== '' ? '<span>' + esc(it.range) + '</span>' : '')
        + '</div>';
    });
    if (spec.validFrom) {
      html += '<div class="agn-leg-row agn-leg-valid">' + esc(spec.validFrom) + '</div>';
    }
    if (spec.note) {
      html += '<div class="agn-leg-row agn-leg-note">' + esc(spec.note) + '</div>';
    }
    if (spec.distribution) {
      html += '<div class="agn-leg-row agn-leg-dist">' + esc(spec.distribution) + '</div>';
    }
    if (spec.source) {
      html += '<div class="agn-leg-row agn-leg-src">' + esc(spec.source) + '</div>';
    }
    return html;
  }

  

  function render(el, spec, name) {
    if (typeof el === 'string') el = D.getElementById(el);
    if (!el) return null;
    el.innerHTML = legend(spec);
    declare(el, spec, name);
    return el;
  }

  function declare(el, spec, name) {
    if (typeof el === 'string') el = D.getElementById(el);
    if (!el) return null;
    var id = name || el.id || ('visual-' + (DECLARED.size + 1));
    el.setAttribute('data-agn-visual', id);
    el.setAttribute('data-agn-legend', (spec && spec.title) || id);
    DECLARED.set(id, { title:(spec && spec.title) || null,
                       items:((spec && spec.items) || []).length,
                       at:Date.now() });
    return id;
  }

  AGN.ui.legend = legend;
  AGN.ui.legend.render = render;
  AGN.ui.legend.declare = declare;
  AGN.ui.legend.declared = function () { return Array.from(DECLARED.keys()); };
  AGN.ui.legend.spec = function (id) { return DECLARED.get(id) || null; };
})(window);
