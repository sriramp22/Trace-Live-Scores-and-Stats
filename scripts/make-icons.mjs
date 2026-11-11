// Generates the Trace app icons (PNG) with no dependencies: `node scripts/make-icons.mjs`
// The icon is a pulse-style "trace" line ending in a live dot, on the app's dark background.
import { deflateSync, crc32 } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG_TOP = [20, 25, 34]
const BG_BOTTOM = [9, 12, 17]
const LINE = [79, 140, 255]
const DOT = [255, 77, 79]

// Polyline in unit coordinates
const PATH = [
  [0.14, 0.56], [0.33, 0.56], [0.43, 0.27], [0.56, 0.78], [0.65, 0.56], [0.8, 0.56],
]
const DOT_AT = [0.8, 0.56]

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
// Anti-aliased coverage for a shape of the given radius, one pixel of falloff
const cover = (dist, radius, px) => Math.max(0, Math.min(1, (radius - dist) / px + 0.5))

function render(size) {
  const px = 1 / size
  const raw = Buffer.alloc(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 3 + 1)
    raw[rowStart] = 0 // PNG filter: none
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * px
      const v = (y + 0.5) * px
      let color = mix(BG_TOP, BG_BOTTOM, v)
      let d = Infinity
      for (let i = 0; i < PATH.length - 1; i++) d = Math.min(d, distToSegment(u, v, PATH[i], PATH[i + 1]))
      color = mix(color, LINE, cover(d, 0.038, px))
      const dd = Math.hypot(u - DOT_AT[0], v - DOT_AT[1])
      color = mix(color, BG_BOTTOM, cover(dd, 0.1, px)) // gap ring around the dot
      color = mix(color, DOT, cover(dd, 0.07, px))
      const o = rowStart + 1 + x * 3
      raw[o] = Math.round(color[0])
      raw[o + 1] = Math.round(color[1])
      raw[o + 2] = Math.round(color[2])
    }
  }
  return raw
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  writeFileSync(`public/${name}`, png(size))
  console.log(`public/${name} (${size}x${size})`)
}
