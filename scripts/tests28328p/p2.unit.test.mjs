/* v91.17.283.28 · P2 · the unsourced static 0-100 "asset sensitivity" column and the "Sector x hazard exposure" expert matrix are deleted
   (code and data block, not hidden). usage: node scripts/tests28328p/p2.unit.test.mjs */
import { T, src, MACH } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(!/const SECTOR_VULN|SECTOR_VULN\[|renderSectorHeatmap|sectorHazardMatrix|id="sectorHeatPanel"|id="sectorHeatMap"|mach-v11-heatmap-wiring/.test(S), 'P2 the sector x hazard matrix: data, renderer, wiring and panel are gone');
ok(!/const sensitivity = \{|SENSITIVITY_REGISTRY|sensitivity\[asset\]|r\.sensitivity/.test(S), 'P2 the asset-sensitivity table, its registry and its readers are gone');
ok(!/<th>Asset sensitivity<\/th>/.test(S) && /<tbody id="asmtResultsRows"><tr><td colspan="4">/.test(S), 'P2 the results table has no sensitivity column (4 columns)');
ok(/knownAsset=!!assetNames\[r\.asset_type\]/.test(S), 'P2 a recognised asset type is read from the asset-type names, not from the deleted table');
done();
