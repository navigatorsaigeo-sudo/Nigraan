const RAMP = [
  [0, [16, 8, 8, 0.3]],
  [1 / 6, [78, 12, 12, 0.62]],
  [2 / 6, [118, 12, 12, 0.78]],
  [3 / 6, [160, 10, 10, 0.86]],
  [4 / 6, [205, 6, 6, 0.92]],
  [1, [255, 0, 0, 0.96]],
];

function ramp(value) {
  let k = 0;
  while (k < RAMP.length - 2 && value > RAMP[k + 1][0]) k += 1;
  const a = RAMP[k];
  const b = RAMP[k + 1];
  const t = Math.max(0, Math.min(1, (value - a[0]) / (b[0] - a[0])));
  return a[1].map((channel, i) => channel + (b[1][i] - channel) * t);
}

function merc(lat) {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

function ringPath(ctx, xOf, yOf, rings) {
  rings.forEach((ring) => {
    ring.forEach((point, i) => {
      if (i) ctx.lineTo(xOf(point[1]), yOf(point[0]));
      else ctx.moveTo(xOf(point[1]), yOf(point[0]));
    });
    ctx.closePath();
  });
}

/* Same field as the sealed start page: the server grid, clipped to Pakistan, with IIOJK left blank. */
export function drawHazardSurface(gridJson, national, iiojk) {
  const grid = gridJson.grid;
  const values = gridJson.v;
  const max = gridJson.scale && gridJson.scale.max > 0 ? +gridJson.scale.max : null;
  if (!grid || !Array.isArray(values) || !max) return null;
  const south = grid.s - grid.dLat / 2;
  const north = grid.s + (grid.rows - 0.5) * grid.dLat;
  const west = grid.w - grid.dLon / 2;
  const east = grid.w + (grid.cols - 0.5) * grid.dLon;
  const width = Math.min(1100, Math.max(500, grid.cols * 10));
  const height = Math.round((width * (merc(north) - merc(south))) / ((east - west) * Math.PI / 180));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const pixels = image.data;
  const xOf = (lon) => ((lon - west) / (east - west)) * width;
  const yOf = (lat) => ((merc(north) - merc(lat)) / (merc(north) - merc(south))) * height;
  const at = (row, col) => {
    if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) return null;
    const value = values[row * grid.cols + col];
    return value == null ? null : +value;
  };
  for (let y = 0; y < height; y += 1) {
    const my = merc(north) - ((y + 0.5) / height) * (merc(north) - merc(south));
    const lat = ((2 * Math.atan(Math.exp(my)) - Math.PI / 2) * 180) / Math.PI;
    const fr = (lat - grid.s) / grid.dLat;
    const row0 = Math.floor(fr);
    const dRow = fr - row0;
    for (let x = 0; x < width; x += 1) {
      const lon = west + ((x + 0.5) / width) * (east - west);
      const fc = (lon - grid.w) / grid.dLon;
      const col0 = Math.floor(fc);
      const dCol = fc - col0;
      const samples = [
        [row0, col0, (1 - dRow) * (1 - dCol)],
        [row0, col0 + 1, (1 - dRow) * dCol],
        [row0 + 1, col0, dRow * (1 - dCol)],
        [row0 + 1, col0 + 1, dRow * dCol],
      ];
      let weight = 0;
      let total = 0;
      samples.forEach(([row, col, share]) => {
        const value = at(row, col);
        if (value != null) {
          weight += share;
          total += share * value;
        }
      });
      if (weight <= 0.001) continue;
      const colour = ramp(Math.min(1, total / weight / max));
      const offset = (y * width + x) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = Math.round(255 * colour[3] * Math.min(1, weight * 1.6));
    }
  }
  const temp = document.createElement('canvas');
  temp.width = width;
  temp.height = height;
  temp.getContext('2d').putImageData(image, 0, 0);
  ctx.save();
  ctx.beginPath();
  ringPath(ctx, xOf, yOf, national);
  ctx.clip();
  try { ctx.filter = 'blur(2px)'; } catch { /* older canvas */ }
  ctx.drawImage(temp, 0, 0);
  ctx.restore();
  if (iiojk.length) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ringPath(ctx, xOf, yOf, iiojk);
    ctx.fill();
    ctx.restore();
  }
  return { url: canvas.toDataURL('image/png'), bounds: [[south, west], [north, east]] };
}
