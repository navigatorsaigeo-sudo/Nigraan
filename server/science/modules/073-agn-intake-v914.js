


(function (G) {
  'use strict';
  var D = G.document, AGN = G.AGN = G.AGN || {};
  var SPECS = Object.create(null);

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  

  function rows(text) {
    if (AGN.assets && typeof AGN.assets.parseCsv === 'function') {
      

    }
    var out = [], row = [], field = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i], n = text[i + 1];
      if (quoted) {
        if (c === '"' && n === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && n === '\n') i++;
        row.push(field);
        if (row.some(function (v) { return v.trim() !== ''; })) out.push(row);
        row = []; field = '';
      } else field += c;
    }
    row.push(field);
    if (row.some(function (v) { return v.trim() !== ''; })) out.push(row);
    return out;
  }
  function toObjects(text, columns) {
    var r = rows(text);
    if (r.length < 2) return [];
    var head = r[0].map(function (x) { return x.trim().toLowerCase(); });
    return r.slice(1).map(function (v) {
      var o = {};
      columns.forEach(function (c) {
        var i = head.indexOf(c.name.toLowerCase());
        o[c.name] = (i >= 0 ? String(v[i] == null ? '' : v[i]).trim() : '');
      });
      return o;
    });
  }

  function register(spec) { SPECS[spec.key] = spec; return spec; }
  function get(key) { return SPECS[key] || null; }
  function keys() { return Object.keys(SPECS); }

  

  function templateCsv(key) {
    var s = SPECS[key]; if (!s) return '';
    var head = s.columns.map(function (c) { return csvCell(c.name); }).join(',');
    var body = (s.sample || []).map(function (rw) {
      return s.columns.map(function (c) { return csvCell(rw[c.name]); }).join(',');
    }).join('\n');
    return head + '\n' + body + (body ? '\n' : '');
  }

  function download(name, text) {
    try {
      var b = new Blob([text], { type: 'text/csv;charset=utf-8' });
      var u = URL.createObjectURL(b), a = D.createElement('a');
      a.href = u; a.download = name; D.body.appendChild(a); a.click();
      setTimeout(function () { D.body.removeChild(a); URL.revokeObjectURL(u); }, 0);
      return true;
    } catch (e) { return false; }
  }

  

  function apply(key, objs) {
    var s = SPECS[key];
    if (!s) return { added: 0, rejected: [], why: 'no such intake' };
    var added = 0, rejected = [];
    (objs || []).forEach(function (o, i) {
      var miss = s.columns.filter(function (c) {
        return c.required && String(o[c.name] == null ? '' : o[c.name]).trim() === '';
      }).map(function (c) { return c.name; });
      if (miss.length) {
        rejected.push({ line: i + 2, why: 'missing required: ' + miss.join(', ') });
        return;
      }
      var v = s.validate ? s.validate(o) : null;
      if (v) { rejected.push({ line: i + 2, why: v }); return; }
      

      var _n0 = null;
      try { _n0 = (typeof s.count === 'function') ? s.count() : null; } catch (_) { _n0 = null; }
      try {
        s.add(o);
        var _n1 = null;
        try { _n1 = (typeof s.count === 'function') ? s.count() : null; } catch (_) { _n1 = null; }
        if (_n0 == null || _n1 == null) { added++; }
        else if (_n1 > _n0) { added++; }
        else {
          rejected.push({ line: i + 2, why: 'the governed write was refused, so nothing was '
            + 'recorded for this row. The refusal states its own reason on screen.' });
        }
      }
      catch (e) { rejected.push({ line: i + 2, why: String((e && e.message) || e).slice(0, 90) }); }
    });
    try {
      D.dispatchEvent(new CustomEvent('agn:project', { detail: { reason: 'intake:' + key } }));
    } catch (_) {}
    return { added: added, rejected: rejected };
  }

   
  

  function gate(opts) {
    var quiet = !!(opts && opts.quiet), blockers = [], asked = 0, failed = [];
    keys().forEach(function (k) {
      var s = get(k); if (!s) return;
      asked += 1;
      if (typeof s.resolve !== 'function') return;
      var r = null;
      try { r = quiet ? withoutFocus(s.resolve) : s.resolve(); }
      catch (e) { failed.push({ store: k, why: 'its own check threw: ' + ((e && e.message) || e) }); return; }
      if (r && r.why) blockers.push({ store: k, label: s.label || k, why: String(r.why) });
    });
    return { ready: blockers.length === 0 && failed.length === 0,
             blockers: blockers, unreadable: failed, stores: asked,
             asked_at: new Date().toISOString() };
  }
   
  function withoutFocus(fn) {
    var si = Element.prototype.scrollIntoView, fo = HTMLElement.prototype.focus;
    Element.prototype.scrollIntoView = function () {};
    HTMLElement.prototype.focus = function () {};
    try { return fn(); } finally { Element.prototype.scrollIntoView = si; HTMLElement.prototype.focus = fo; }
  }

  

  AGN.intake = { register: register, get: get, keys: keys,
                 apply: apply, templateCsv: templateCsv, toObjects: toObjects,
                 gate: gate };
})(window);
