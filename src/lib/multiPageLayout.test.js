import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, degrees } from 'pdf-lib'
import { calculateLayout, calculatePagePlacement, exportMultiPagePdf, getCellRect, LAYOUT_PRESETS, MM_TO_PT } from './multiPageLayout.js'

test('all six presets keep cells inside the sheet and calculate incomplete sheets', () => {
  for (const preset of LAYOUT_PRESETS) {
    const layout = calculateLayout({
      pageCount: 17, preset: preset.id, paper: 'A4', orientation: 'portrait',
      marginMm: 10, gapXmm: 5, gapYmm: 5,
    })
    assert.equal(layout.totalSheets, Math.ceil(17 / preset.count))
    assert.equal(layout.pagesPerSheet, preset.count)
    assert.equal(layout.columns * layout.rows, preset.count)
    for (let cell = 0; cell < preset.count; cell += 1) {
      const rect = getCellRect(layout, cell)
      assert.ok(rect.x >= layout.margin - 1e-7)
      assert.ok(rect.y >= layout.margin - 1e-7)
      assert.ok(rect.x + rect.width <= layout.width - layout.margin + 1e-7)
      assert.ok(rect.y + rect.height <= layout.height - layout.margin + 1e-7)
    }
  }
})

test('paper orientation and point conversion follow the selected sheet dimensions', () => {
  const portrait = calculateLayout({ pageCount: 1, preset: '2', paper: 'Letter', orientation: 'portrait', marginMm: 0, gapXmm: 0, gapYmm: 0 })
  const landscape = calculateLayout({ pageCount: 1, preset: '2', paper: 'Letter', orientation: 'landscape', marginMm: 0, gapXmm: 0, gapYmm: 0 })
  assert.equal(portrait.width, 612)
  assert.equal(portrait.height, 792)
  assert.equal(landscape.width, 792)
  assert.equal(landscape.height, 612)
  assert.equal(MM_TO_PT, 72 / 25.4)
})

test('invalid spacing and unusable cells are rejected while boundary values work', () => {
  const common = { pageCount: 1, preset: '16', paper: 'A4', orientation: 'portrait' }
  assert.doesNotThrow(() => calculateLayout({ ...common, marginMm: 30, gapXmm: 15, gapYmm: 15 }))
  assert.throws(() => calculateLayout({ ...common, marginMm: 30.1, gapXmm: 0, gapYmm: 0 }), /allowed ranges/)
  assert.throws(() => calculateLayout({ ...common, marginMm: '', gapXmm: 0, gapYmm: 0 }), /allowed ranges/)
  assert.throws(() => calculateLayout({ ...common, marginMm: 0, gapXmm: 15.1, gapYmm: 0 }), /allowed ranges/)
})

test('rotated page corners fit the centered cell without distortion', () => {
  const cell = { x: 40, y: 70, width: 240, height: 310 }
  for (const rotation of [0, 90, 180, 270]) {
    const sourceWidth = 400
    const sourceHeight = 600
    const place = calculatePagePlacement(sourceWidth, sourceHeight, rotation, cell)
    assert.ok(Math.abs(place.width / sourceWidth - place.height / sourceHeight) < 1e-10)
    const angle = (-place.rotation * Math.PI) / 180
    const corners = [[0, 0], [sourceWidth, 0], [0, sourceHeight], [sourceWidth, sourceHeight]].map(([x, y]) => {
      const sx = x * (place.width / sourceWidth)
      const sy = y * (place.height / sourceHeight)
      return [place.drawX + sx * Math.cos(angle) - sy * Math.sin(angle), place.drawY + sx * Math.sin(angle) + sy * Math.cos(angle)]
    })
    const minX = Math.min(...corners.map(([x]) => x))
    const maxX = Math.max(...corners.map(([x]) => x))
    const minY = Math.min(...corners.map(([, y]) => y))
    const maxY = Math.max(...corners.map(([, y]) => y))
    assert.ok(Math.abs(minX - place.x) < 1e-7, 'left bound for rotation ' + rotation)
    assert.ok(Math.abs(minY - place.y) < 1e-7, 'bottom bound for rotation ' + rotation)
    assert.ok(Math.abs(maxX - place.x - place.fittedWidth) < 1e-7, 'right bound for rotation ' + rotation)
    assert.ok(Math.abs(maxY - place.y - place.fittedHeight) < 1e-7, 'top bound for rotation ' + rotation)
    assert.ok(place.x >= cell.x - 1e-7 && place.y >= cell.y - 1e-7)
    assert.ok(place.x + place.fittedWidth <= cell.x + cell.width + 1e-7)
    assert.ok(place.y + place.fittedHeight <= cell.y + cell.height + 1e-7)
  }
})

test('vector export preserves every mixed-size and rotated source page exactly once', async () => {
  const source = await PDFDocument.create()
  for (let index = 0; index < 17; index += 1) {
    const page = source.addPage([400 + index * 3, 600 - index * 2])
    page.drawText('Source page ' + (index + 1), { x: 20, y: 20 })
    if (index === 2) page.setRotation(degrees(90))
  }
  const sourceBytes = await source.save()
  for (const preset of LAYOUT_PRESETS) {
    const result = await exportMultiPagePdf(sourceBytes, {
      preset: preset.id, paper: 'A4', orientation: 'landscape',
      marginMm: 10, gapXmm: 5, gapYmm: 5, borders: true, labels: true,
    })
    const reopened = await PDFDocument.load(result.bytes)
    assert.equal(reopened.getPageCount(), Math.ceil(17 / preset.count))
    assert.ok(reopened.getPages().every((page) => page.getWidth() === result.layout.width && page.getHeight() === result.layout.height))
  }
})
