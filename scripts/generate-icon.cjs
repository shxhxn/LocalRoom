const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const target = 512;
const scale = 2;
const size = target * scale;
const pixels = Buffer.alloc(size * size * 4);

function insideRoundRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const segments = [
  [132, 88, 132, 424], [132, 424, 248, 424],
  [232, 424, 232, 88], [232, 88, 330, 88],
  [330, 88, 379, 98], [379, 98, 417, 132], [417, 132, 432, 179],
  [432, 179, 417, 226], [417, 226, 379, 260], [379, 260, 330, 272],
  [330, 272, 232, 272], [332, 272, 445, 424],
].map((line) => line.map((value) => value * scale));

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const index = (y * size + x) * 4;
    const inTile = insideRoundRect(x, y, 24 * scale, 24 * scale, 488 * scale, 488 * scale, 118 * scale);
    if (!inTile) continue;
    const progress = Math.max(0, Math.min(1, ((x + y) / scale - 104) / 800));
    let red = Math.round(45 + (14 - 45) * progress);
    let green = Math.round(46 + (15 - 46) * progress);
    let blue = Math.round(49 + (17 - 49) * progress);
    const edge = Math.min(x - 24 * scale, y - 24 * scale, 488 * scale - x, 488 * scale - y);
    if (edge < 3 * scale) { red += 15; green += 15; blue += 15; }
    const markDistance = Math.min(...segments.map(([ax, ay, bx, by]) => segmentDistance(x, y, ax, ay, bx, by)));
    const inMark = markDistance <= 17 * scale;
    if (inMark) {
      const markProgress = Math.max(0, Math.min(1, (y / scale - 90) / 350));
      red = Math.round(255 + (201 - 255) * markProgress);
      green = Math.round(255 + (202 - 255) * markProgress);
      blue = Math.round(255 + (197 - 255) * markProgress);
    }
    if (Math.hypot(x - 445 * scale, y - 424 * scale) <= 23 * scale) {
      red = 185;
      green = 109;
      blue = 69;
    }
    pixels[index] = red;
    pixels[index + 1] = green;
    pixels[index + 2] = blue;
    pixels[index + 3] = 255;
  }
}

const reduced = Buffer.alloc(target * target * 4);
for (let y = 0; y < target; y += 1) {
  for (let x = 0; x < target; x += 1) {
    const totals = [0, 0, 0, 0];
    for (let sy = 0; sy < scale; sy += 1) for (let sx = 0; sx < scale; sx += 1) {
      const source = (((y * scale + sy) * size) + x * scale + sx) * 4;
      for (let channel = 0; channel < 4; channel += 1) totals[channel] += pixels[source + channel];
    }
    const output = (y * target + x) * 4;
    for (let channel = 0; channel < 4; channel += 1) reduced[output + channel] = Math.round(totals[channel] / (scale * scale));
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(target, 0);
header.writeUInt32BE(target, 4);
header[8] = 8;
header[9] = 6;
const rows = Buffer.alloc((target * 4 + 1) * target);
for (let y = 0; y < target; y += 1) reduced.copy(rows, y * (target * 4 + 1) + 1, y * target * 4, (y + 1) * target * 4);
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const buildDirectory = path.join(__dirname, '..', 'build');
fs.writeFileSync(path.join(buildDirectory, 'icon.png'), png);

// Windows supports PNG-compressed images inside an ICO container. A zero width
// and height in the directory entry denotes a 256px-or-larger icon.
const iconHeader = Buffer.alloc(22);
iconHeader.writeUInt16LE(0, 0);
iconHeader.writeUInt16LE(1, 2);
iconHeader.writeUInt16LE(1, 4);
iconHeader[6] = 0;
iconHeader[7] = 0;
iconHeader[8] = 0;
iconHeader[9] = 0;
iconHeader.writeUInt16LE(1, 10);
iconHeader.writeUInt16LE(32, 12);
iconHeader.writeUInt32LE(png.length, 14);
iconHeader.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(buildDirectory, 'icon.ico'), Buffer.concat([iconHeader, png]));
