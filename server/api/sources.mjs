/* ══ v91.17.70 · THE CUSTOMER SOURCES PAGE, BUILT FROM THE DATA FILES' OWN LICENCE HEADERS ═══════════════════════════
   Data-source decision option 2 (CEO, 25 Sep 2026): customer outputs rest on AGN's MACH stations and openly licensed
   data. Every open layer carries a "licence" header in its data file (scripts/licence_headers.py writes them; the live
   feeds are in data/open-feeds.json). This module reads those headers and nothing else: it holds no licence text of its
   own, so a layer without a header does not appear, and a new header appears on the next read.

   The governance seat measured that no credits page existed (build_governance_legal.md W5) although the weather feed's
   licence (CC BY 4.0) requires a credit beside the data; the product brand stays MAch and the Sources page names the
   data provider, as counsel advised (A6).

   GET /api/sources  -> { entries: [MACH first, then each open dataset: licence, attribution, url, files], methodsLine }
   Internal references (customer:false: PMD, SUPARCO, NOAA ISD) are listed only with NIGRAAN_INTERNAL_REF=1.

   v91.17.71 · CEO decision 25 Sep 2026: the station, lake-inventory and river-limit data AGN receives under data-sharing
   arrangements is used by default again (refmode.stationData()) and credited GENERICALLY: one customer entry
   (id partner_networks) built from label('network') and label('sourcesLine') in data/source-labels.json. The named
   entries (customer:false) are still listed only with NIGRAAN_INTERNAL_REF=1 (internalNames()). MACH stays first. */
import { readdirSync, readFileSync, statSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { stationData, internalNames, label } from './refmode.mjs';

const MAX_BYTES = 12e6;   /* the licence header sits at the top of files far smaller than this; the store is skipped */
const INTERNAL = () => internalNames();

export function createSources(dataDir) {
  let cache = null; const fileCache = new Map();
  /* a header written by another job may carry no id: it is filed under the dataset it names, so two files that head the
     same dataset make one entry (this maps names to ids only; every licence word still comes from the headers) */
  const CANON = [[/glofas/i, 'glofas'], [/hmaglofdb/i, 'hmaglofdb'], [/era5/i, 'era5'], [/worldcover/i, 'esa_worldcover'], [/copernicus dem|glo-90/i, 'copernicus_dem'], [/open buildings/i, 'open_buildings'],
    [/hydro(sheds|basins)/i, 'hydrosheds'], [/\bghs[l-]/i, 'ghsl'], [/sentinel-2/i, 'sentinel2'], [/sentinel-1/i, 'sentinel1'], [/\brgi\b|randolph/i, 'rgi'], [/imerg/i, 'imerg'], [/\bcams\b/i, 'cams'],
    [/viirs/i, 'viirs'], [/soilgrids/i, 'soilgrids'], [/open-meteo/i, 'weather_feed'], [/\bgiri\b/i, 'giri']];
  const canon = (name) => { for (const [re, id] of CANON) if (re.test(String(name || ''))) return id; return String(name || 'source').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); };
  function headersOf(j) {
    const out = [];
    const push = (x) => { if (x && typeof x === 'object' && (x.id || x.dataset || x.name)) out.push(x.id ? x : { ...x, id: canon(x.dataset || x.name) }); };
    if (Array.isArray(j.licence)) j.licence.forEach(push); else if (j.licence && typeof j.licence === 'object') push(j.licence);
    /* a flat header: "licence"/"license" as a string beside "attribution", named by source.name */
    const flat = typeof j.licence === 'string' ? j.licence : typeof j.license === 'string' ? j.license : null;
    if (!out.length && flat && j.source && typeof j.source === 'object' && (j.source.name || j.source.dataset)) push({ id: canon(j.source.name || j.source.dataset), dataset: j.source.name || j.source.dataset, licence: flat, attribution: j.attribution || j.source.citation || j.source.name, url: j.url || j.source.url || null });
    /* an older single-source header ({source: {name, licence|license, url}}) is read as one record */
    if (!out.length && j.source && typeof j.source === 'object' && (j.source.licence || j.source.license)) {
      push({ id: j.source.id || canon(j.source.name || j.source.dataset || j.source.scheme), dataset: j.source.name || j.source.dataset || (j.source.scheme ? String(j.source.scheme).replace(/\s*\(.*$/, '') : null), licence: j.source.licence || j.source.license, attribution: j.source.attribution || j.source.citation || j.source.name || j.source.dataset, url: j.source.url || null, provider: j.source.provider || null, use: j.source.use || null });
    }
    return out;
  }
  /* v91.17.144 · B5 · the file list and a stat of every data file ran on every report (about 1 s with a cold cache): looked at most every 60 s */
  function scan() { if (cache && cache.__t && Date.now() - cache.__t < 60000) return cache; const c = scanNow(); c.__t = Date.now(); return c; }
  function scanNow() {
    const files = existsSync(dataDir) ? readdirSync(dataDir).filter((f) => f.endsWith('.json') && !/^nigraan-db/.test(f)) : [];
    const stamp = files.map((f) => { try { const s = statSync(join(dataDir, f)); return f + ':' + s.mtimeMs + ':' + s.size; } catch { return f; } }).join('|');
    if (cache && cache.stamp === stamp) return cache;
    const by = new Map(); const skipped = [];
    for (const f of files) {
      let st; try { st = statSync(join(dataDir, f)); } catch { continue; }
      if (st.size > MAX_BYTES) { skipped.push({ file: f, why: 'larger than ' + MAX_BYTES / 1e6 + ' MB' }); continue; }
      /* the header sits in the first bytes of a headed file: a file whose head names no licence is not parsed at all
         (the runtime files - outlook, smog, flood, drought - are several MB and change every hour) */
      const key = f + ':' + st.mtimeMs + ':' + st.size; let j = fileCache.get(key);
      if (j && j.__skip) { skipped.push({ file: f, why: j.__skip }); continue; }
      if (j === undefined) {
        let head = ''; try { const fd = openSync(join(dataDir, f), 'r'); const b = Buffer.alloc(Math.min(65536, st.size)); readSync(fd, b, 0, b.length, 0); closeSync(fd); head = b.toString('utf8'); } catch { head = ''; }
        if (!/"licen[cs]e"/.test(head)) j = null;
        else { try { j = JSON.parse(readFileSync(join(dataDir, f), 'utf8')); } catch (e) { const why = 'not valid JSON: ' + String(e.message).slice(0, 80); skipped.push({ file: f, why }); j = { __skip: why }; } }
        /* v91.17.237 · only the file's source headers are kept, not the whole parsed file (the laptop heap profile: every headed data
           file held in memory, whole, for as long as it did not change) */
        if (j && !j.__skip) j = (typeof j === 'object' && !Array.isArray(j)) ? { __heads: headersOf(j) } : null;
        for (const k of fileCache.keys()) if (k.startsWith(f + ':')) fileCache.delete(k);
        fileCache.set(key, j);
        if (j && j.__skip) continue;
      }
      if (!j || !j.__heads) continue;
      for (const h of j.__heads) {
        const id = String(h.id || h.dataset || h.name);
        const e = by.get(id) || { id, dataset: h.dataset || h.name || id, provider: h.provider || null, licence: h.licence || h.license || null, licenceUrl: h.licenceUrl || null,
          attribution: h.attribution || null, url: h.url || null, use: h.use || null, customer: h.customer !== false, files: [], reaches: [] };
        /* two files may head the same dataset (a register and its open rebuild): a field one leaves empty is filled from the other */
        for (const [k, v] of [['dataset', h.dataset || h.name], ['provider', h.provider], ['licence', h.licence || h.license], ['licenceUrl', h.licenceUrl], ['attribution', h.attribution], ['url', h.url], ['use', h.use]]) if (e[k] == null && v != null) e[k] = v;
        if (h.customer === false) e.customer = false;
        if (!e.files.includes('data/' + f)) e.files.push('data/' + f);
        for (const r of h.reaches || []) if (!e.reaches.includes(r)) e.reaches.push(r);
        by.set(id, e);
      }
    }
    const all = [...by.values()];
    cache = { stamp, all, skipped, at: new Date().toISOString() };
    return cache;
  }
  /* the generic credit for the partner networks: no licence text of its own, every word from data/source-labels.json */
  function partnerEntry() {
    if (!stationData()) return null;
    return { id: 'partner_networks', dataset: label('network'), provider: null, licence: 'used under data-sharing arrangements', licenceUrl: null,
      attribution: label('sourcesLine'), url: null, use: [label('calibration'), label('lakeInventory'), label('riverLimits')].join('; '),
      customer: true, files: [], reaches: [] };
  }
  function list() {
    const S = scan();
    const shown = S.all.filter((e) => e.customer || INTERNAL());
    const pe = partnerEntry(); if (pe) shown.push(pe);
    /* MACH first (AGN's own network), then the weather feed, then the partner networks (generic), then the rest by name */
    const rank = (e) => (e.id === 'mach' ? 0 : e.id === 'weather_feed' ? 1 : e.id === 'partner_networks' ? 2 : e.customer ? 3 : 4);
    return shown.sort((a, b) => rank(a) - rank(b) || String(a.dataset).localeCompare(String(b.dataset)));
  }
  /* one line for every report's methods note: the network, then each credit */
  function methodsLine() {
    const L = list().filter((e) => e.customer);
    if (!L.length) return 'Sources: MACH stations (AGN). No licence headers were found in the data directory.';
    /* the partner entry is credited by its short line (label('network')), not the page's full sentence */
    return 'Sources: ' + L.map((e) => e.id === 'partner_networks' ? label('network') : (e.attribution || e.dataset) + (e.licence && !/proprietary/i.test(e.licence) ? ' (' + e.licence.replace(/\s*\(.*$/, '') + ')' : '')).join('; ') + '. Full list with licences: Sources page (/api/sources).';
  }
  function page() {
    const S = scan(); const entries = list();
    return {
      schema: 'agn.sources.v1', generatedAt: new Date().toISOString(),
      title: 'Sources and licences',
      statement: stationData()
        ? 'NIGRAAN values are built from AGN’s own MACH weather stations, from ' + label('network') + ', and from the openly licensed datasets below. ' + label('sourcesLine') + ' Each open dataset is listed with its licence and the attribution its licence requires. Weather data are delivered through the MAch service.'
        : 'NIGRAAN values are built from AGN’s own MACH weather stations and from the openly licensed datasets below. Each dataset is listed with its licence and the attribution its licence requires. Weather data are delivered through the MAch service.',
      network: entries.find((e) => e.id === 'mach') || null,
      entries: entries.map((e) => ({ id: e.id, dataset: e.dataset, provider: e.provider, licence: e.licence, licenceUrl: e.licenceUrl, attribution: e.attribution, url: e.url, use: e.use, files: e.files, reaches: e.reaches.length ? e.reaches : undefined, ...(e.tier ? { tier: e.tier } : {}), ...(e.customer ? {} : { internalOnly: true }) })),
      stationData: stationData(),
      count: entries.length,
      methodsLine: methodsLine(),
      internalRef: INTERNAL(),
      builtFrom: 'the "licence" header of each data file (scripts/licence_headers.py) and data/open-feeds.json; files read at ' + S.at,
      ...(INTERNAL() ? { skipped: S.skipped } : {}),
    };
  }
  /* v91.17.283.51 · B3 · start-up: the licence headers are read ahead OFF the warm-up path, one file per turn of the event loop with
     non-blocking reads (the warm-up's synchronous scan took 21 s on the laptop after it woke: every data file stat-ed and the headed ones
     parsed while customers waited). It fills the same per-file cache scanNow() reads (same keys, same values), so the first list() after
     it only stats; list() still works before it has finished (it reads what is missing itself, as before). */
  async function prewarm() {
    const fsp = await import('node:fs/promises'); const turn = () => new Promise((r) => setImmediate(r));
    let files = []; try { files = (await fsp.readdir(dataDir)).filter((f) => f.endsWith('.json') && !/^nigraan-db/.test(f)); } catch (_) { return 0; }
    let n = 0;
    for (const f of files) {
      await turn();
      let st; try { st = await fsp.stat(join(dataDir, f)); } catch { continue; }
      if (st.size > MAX_BYTES) continue;
      const key = f + ':' + st.mtimeMs + ':' + st.size; if (fileCache.get(key) !== undefined) continue;
      let head = ''; try { const fh = await fsp.open(join(dataDir, f), 'r'); try { const b = Buffer.alloc(Math.min(65536, st.size)); await fh.read(b, 0, b.length, 0); head = b.toString('utf8'); } finally { await fh.close(); } } catch { head = ''; }
      let j;
      if (!/"licen[cs]e"/.test(head)) j = null;
      else { let txt = null; try { txt = await fsp.readFile(join(dataDir, f), 'utf8'); } catch { txt = null; } await turn();
        try { j = JSON.parse(txt); } catch (e) { j = { __skip: 'not valid JSON: ' + String(e.message).slice(0, 80) }; } }
      if (j && !j.__skip) j = (typeof j === 'object' && !Array.isArray(j)) ? { __heads: headersOf(j) } : null;
      if (fileCache.get(key) !== undefined) continue;   /* a list() in the meantime read it */
      for (const k of fileCache.keys()) if (k.startsWith(f + ':')) fileCache.delete(k);
      fileCache.set(key, j); n++;
    }
    return n;
  }
  return { page, list, methodsLine, prewarm };
}
