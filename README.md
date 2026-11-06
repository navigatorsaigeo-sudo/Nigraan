# Nigraan

Local NIGRAAN deployment: **React frontend** (`web/`) and Node backend (`server/`).

```bash
# Backend (API + static React dist)
npm start                    # http://localhost:8787

# Frontend (dev)
cd web && npm install && npm run dev    # Vite, proxies API
cd web && npm run build                 # production build into web/dist
```

Copy `.env.example` to `.env` and set `NIGRAAN_DASHBOARD_PASSWORD` / provider keys as needed. Never commit `.env` or `*.key` files.

## Pages (v91.17.144)

| URL | Page |
|---|---|
| `/` | NIGRAAN, the analytics page (sealed artefact). The server adds one switch bar before `</body>` (`/agn-switch.css`, `/agn-switch.js`, both served from this origin, so the page's CSP and its inline-script hashes are untouched). |
| `/customize` (`/n3` is the same) | Customize NIGRAAN for AJG Supplies: every AJG site through weather, hazard, impact, ESG, the scenario lab and the report. |
| `/v5` | Retired (NIGRAAN 2, five tabs). Redirects to `/`. |

The switch keeps the place: leaving one page writes the current point to `localStorage` key `agn.switchPlace` (read once, within
2 minutes), and `#agnplace=lat,lon,name` in the URL opens either page on that point.

The AJG site list is `data/clients/ajg/sites.csv` (`sites.csv.status` = `provisional` until AJG sends the real list).

## The provider key never reaches the browser

Put the paid Open-Meteo key in `nigraan-local/mach.key`, one line, nothing
else. The server reads it at start-up, holds it in the process, attaches it
to outbound calls itself, and never sends it to the page. It prints which
source it came from in the start-up banner.

`MACH_API_KEY` or `OPEN_METEO_API_KEY` in the environment work too and take
precedence, but `mach.key` is the intended path: a key on a command line ends
up in shell history, in `ps`, and in `.bat` files.

An `apikey` parameter arriving from the browser is deleted, never honoured.

There is a third, legacy path — recovering the key from an INTERNAL build in
`secrets/` — and it is **off unless `NIGRAAN_ALLOW_SECRET_HTML=1` is set**.
While such a file is present the server prints a WARNING on every boot. Move
the key to `mach.key`, delete that file, and rotate the key.

Without any key the process runs with no provider rather than falling back to
the free tier.

## Two jobs, deliberately separated

**1. Serve the artefact byte for byte.** The file pins every inline `<script>`
by SHA-256 in its own CSP. Change one byte and the browser silently refuses to
execute that block — nothing throws, the module simply never defines what it
was going to define, and the failure surfaces far away as "Cannot read
properties of undefined". So this server never rewrites the HTML in transit and
sets no CSP header of its own. It prints the hash it is serving at start-up;
compare it against `artefact/MANIFEST.json`.

**2. Be the backend.** `AGN.backendInterfaces.list()` in the artefact declares
89 endpoints and `server/contract/openapi.json` carries 82 paths. This is no
longer a three-endpoint stub: **26 route prefixes** (62 local routes plus the 89
contract endpoints) are served, in these groups —

| group | what it serves |
|---|---|
| `/api/outlook/…` | 15-day ensemble, weeks-ahead EC46, seasonal SEAS5 |
| `/api/flood/…` | river discharge, gauge ladders, national and point |
| `/api/urban/…` | urban heat field: point, national, cells, status |
| `/api/climatology/…` | SPI/SPEI, drought composite, thresholds |
| `/api/smog/…` | CAMS PM2.5 and dispersion, per unit and national |
| `/api/verification/…`, `/api/checks/…`, `/api/skill/…` | scoring and self-tests |
| `/api/ai/…` | grounded retrieval chat (`/api/ai/chat`) |
| `/api/map/…`, `/api/geo/…`, `/api/mos/…`, `/api/idf/…` | layers, gazetteer, MOS, IDF |
| `/api/report/…`, `/api/ops/…` | report context, job health |
| `/api/v1/…` | the contract surface, 82 paths, most behind auth |
| `/api/health`, `/api/manifest` | provider tier and delivered-byte hashes |
| `/px/<path>?__omhost=<host>` | the only provider forward: the paid key is attached server-side; free-tier hosts are refused |
| `/api/limits/…` | client operating limits against the named run and the ensemble, the crossing ledger, catchment heavy rain |
| `/api/glof/…` | named glacial lakes upstream of a point (PMD 2024 inventory, SUPARCO list and bulletins) |
| `/api/imerg/…` | satellite rain verification (GPM IMERG; token read from `earthdata.key`, never served) |
| `/api/obs/…`, `/api/ext/…` | station bias against the record; met.no and USGS through this server |

An unknown path under `/api/` returns **404 with a note naming where the
contract lives**, not a bare 404. (Earlier versions of this file said 501 was
returned and argued for it. That was written when three of the 89 endpoints
existed and everything else was genuinely unimplemented. Now an unrecognised
path is genuinely unrecognised, which is what 404 means; the body still names
what exists, which was the point.)

A transport failure to the provider returns **502 with the reason**. It is not
turned into an empty result set, which would reach the product as "no data" and
be indistinguishable from the provider having nothing to say.

## Environment

| var | default | note |
|---|---|---|
| `MACH_API_KEY` / `OPEN_METEO_API_KEY` | *(unset)* | overrides `mach.key`; prefer the file |
| `NIGRAAN_ALLOW_SECRET_HTML` | *(unset)* | `1` re-enables the legacy key recovery from `secrets/` |
| `PORT` | `8787` | |
| `HOST` | `127.0.0.1` | set `0.0.0.0` to expose on the LAN |
| `NIGRAAN_ARTEFACT` | `AI_GEO_NIGRAAN_v91_17_MACH.html` | which file is served at `/` |
| `NIGRAAN_WORKER` | on | `0` disables the background job worker |
| `NIGRAAN_SMOG` | on | `0` disables the air and smog job |

## What is in `artefact/`

| file | what it is |
|---|---|
| `AI_GEO_NIGRAAN_v91_17_MACH.html` | the built, rebranded, resealed artefact — this is what is served |
| `AI_GEO_NIGRAAN_v91_17_CLIENT.html` | the pristine v91.17 source the build transforms |
| `MANIFEST.json` | byte count and SHA-256 of the served artefact |

**None of the three carries a credential.** Checked, not assumed: the key in
`mach.key` matches zero times in every one of them. The long base64-looking
strings inside are the CSP SHA-256 hashes of the inline blocks, which is what
they are supposed to be.

The INTERNAL v91.16.5 build is a different file and does carry the key. It
belongs in `secrets/`, it is never served, and it should be deleted.
