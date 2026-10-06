// Minimal PNG writer for sim captures: 8-bit RGBA, filter 0, one IDAT.
import { deflateSync } from "node:zlib";

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, Bun.hash.crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8); // depth 8, colour type RGBA, deflate, filter set 0, no interlace
  const rows = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const parts = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}

/** Nearest-neighbour upscale, so a 400×240 capture reads like the 2× mockups. */
export function scale(width: number, height: number, rgba: Uint8Array, factor: number): Uint8Array {
  const out = new Uint8Array(width * factor * height * factor * 4);
  for (let y = 0; y < height * factor; y++)
    for (let x = 0; x < width * factor; x++)
      out.set(rgba.subarray(((y / factor | 0) * width + (x / factor | 0)) * 4, ((y / factor | 0) * width + (x / factor | 0)) * 4 + 4), (y * width * factor + x) * 4);
  return out;
}
