export function decodeRing(deltas, q) {
  const out = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < deltas.length; i += 2) {
    x += deltas[i];
    y += deltas[i + 1];
    out.push([y / q, x / q]);
  }
  return out;
}

export function decodeParts(parts, q) {
  return (parts || []).map((part) => decodeRing(part[0] || part, q));
}
