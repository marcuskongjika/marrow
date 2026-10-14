#!/usr/bin/env node
/**
 * Rasterizes build/icon.svg into every format electron-builder needs.
 *
 * Writes:
 *   build/icon.png      1024x1024, used for Linux and as the generic source
 *   build/icon.ico      Windows, 16-256px PNG-compressed entries
 *   build/icon.icns     macOS, PNG chunks from 16px to 1024px
 *   build/icons/*.png   individual sizes, handy for stores and docs
 *
 * The .ico and .icns containers are assembled here rather than shelled out to
 * iconutil or ImageMagick, so `npm run icons` works the same on every platform.
 *
 * Run it after editing icon.svg:  npm run icons
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const buildDir = join(here, '..', 'build')
const source = join(buildDir, 'icon.svg')

const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/** ICNS chunk types keyed by pixel size, newest-generation PNG variants. */
const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32],
  ['icp6', 64],
  ['ic12', 64],
  ['ic07', 128],
  ['ic13', 256],
  ['ic08', 256],
  ['ic14', 512],
  ['ic09', 512],
  ['ic10', 1024]
]

async function render(size) {
  return sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

/** ICO container: 6-byte header, 16-byte directory entries, then PNG payloads. */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length

  images.forEach((image, index) => {
    const base = index * 16
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, base) // width
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, base + 1) // height
    directory.writeUInt8(0, base + 2) // palette
    directory.writeUInt8(0, base + 3) // reserved
    directory.writeUInt16LE(1, base + 4) // colour planes
    directory.writeUInt16LE(32, base + 6) // bits per pixel
    directory.writeUInt32LE(image.data.length, base + 8)
    directory.writeUInt32LE(offset, base + 12)
    offset += image.data.length
  })

  return Buffer.concat([header, directory, ...images.map((image) => image.data)])
}

/** ICNS container: 'icns' + total length, then type/length/payload chunks. */
function buildIcns(chunks) {
  const blocks = chunks.map(({ type, data }) => {
    const head = Buffer.alloc(8)
    head.write(type, 0, 4, 'ascii')
    head.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([head, data])
  })

  const body = Buffer.concat(blocks)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 4, 'ascii')
  head.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([head, body])
}

async function main() {
  await mkdir(join(buildDir, 'icons'), { recursive: true })

  const rendered = new Map()
  for (const size of PNG_SIZES) {
    const data = await render(size)
    rendered.set(size, data)
    await writeFile(join(buildDir, 'icons', `${size}x${size}.png`), data)
  }

  const master = rendered.get(1024)
  await writeFile(join(buildDir, 'icon.png'), master)

  const ico = buildIco(ICO_SIZES.map((size) => ({ size, data: rendered.get(size) })))
  await writeFile(join(buildDir, 'icon.ico'), ico)

  const icnsChunks = []
  for (const [type, size] of ICNS_TYPES) {
    let data = rendered.get(size)
    if (!data) data = await render(size)
    icnsChunks.push({ type, data })
  }
  await writeFile(join(buildDir, 'icon.icns'), buildIcns(icnsChunks))

  console.log(
    `icons written: icon.png, icon.ico (${ICO_SIZES.length} sizes), icon.icns (${icnsChunks.length} chunks), icons/ (${PNG_SIZES.length} sizes)`
  )
}

main().catch((error) => {
  console.error('icon generation failed:', error)
  process.exitCode = 1
})
