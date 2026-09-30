import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

export const MM_TO_PT = 72 / 25.4

export const LAYOUT_PRESETS = [
  { id: '2', count: 2, label: '2 per sheet', portrait: [1, 2], landscape: [2, 1] },
  { id: '4', count: 4, label: '4 per sheet', portrait: [2, 2], landscape: [2, 2] },
  { id: '6', count: 6, label: '6 per sheet', portrait: [2, 3], landscape: [3, 2] },
  { id: '9', count: 9, label: '9 per sheet', portrait: [3, 3], landscape: [3, 3] },
  { id: '12', count: 12, label: '12 per sheet', portrait: [3, 4], landscape: [4, 3] },
  { id: '16', count: 16, label: '16 per sheet', portrait: [4, 4], landscape: [4, 4] },
]

export const PAPER_SIZES = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  Letter: [612, 792],
}

export function getSheetSize({ paper, orientation, originalSize }) {
  let [width, height] = paper === 'Original' ? originalSize : PAPER_SIZES[paper]
  if (!width || !height || !Number.isFinite(width + height)) throw new Error('The selected sheet size is not available.')
  if ((orientation === 'landscape') !== (width > height)) [width, height] = [height, width]
  return { width, height }
}

export function calculateLayout({ pageCount, preset, paper, orientation, originalSize, marginMm, gapXmm, gapYmm }) {
  const selected = LAYOUT_PRESETS.find((item) => item.id === String(preset))
  if (!selected) throw new Error('Choose one of the available page layouts.')
  const [columns, rows] = selected[orientation]
  const { width, height } = getSheetSize({ paper, orientation, originalSize })
  const margin = Number(marginMm) * MM_TO_PT
  const gapX = Number(gapXmm) * MM_TO_PT
  const gapY = Number(gapYmm) * MM_TO_PT
  const availableWidth = width - margin * 2 - gapX * (columns - 1)
  const availableHeight = height - margin * 2 - gapY * (rows - 1)
  if (marginMm === '' || gapXmm === '' || gapYmm === '' || ![margin, gapX, gapY].every(Number.isFinite) || margin < 0 || gapX < 0 || gapY < 0 || marginMm > 30 || gapXmm > 15 || gapYmm > 15) {
    throw new Error('Margins and spacing must stay within their allowed ranges.')
  }
  if (availableWidth <= 0 || availableHeight <= 0) {
    throw new Error('These margins and gaps leave no room for pages. Reduce the spacing to continue.')
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('The source PDF has no pages to arrange.')
  const cellWidth = availableWidth / columns
  const cellHeight = availableHeight / rows
  return {
    width, height, columns, rows, pageCount, pagesPerSheet: selected.count,
    totalSheets: Math.ceil(pageCount / selected.count), margin, gapX, gapY, cellWidth, cellHeight,
  }
}

export function getCellRect(layout, slot) {
  const col = slot % layout.columns
  const row = Math.floor(slot / layout.columns)
  return {
    x: layout.margin + col * (layout.cellWidth + layout.gapX),
    y: layout.height - layout.margin - (row + 1) * layout.cellHeight - row * layout.gapY,
    width: layout.cellWidth,
    height: layout.cellHeight,
  }
}

function normalizedRotation(angle) {
  const normalized = ((angle % 360) + 360) % 360
  return [0, 90, 180, 270].includes(normalized) ? normalized : 0
}

export function calculatePagePlacement(sourceWidth, sourceHeight, rotationAngle, cell) {
  const rotation = normalizedRotation(rotationAngle)
  const rotatedWidth = rotation % 180 ? sourceHeight : sourceWidth
  const rotatedHeight = rotation % 180 ? sourceWidth : sourceHeight
  const scale = Math.min(cell.width / rotatedWidth, cell.height / rotatedHeight)
  const width = sourceWidth * scale
  const height = sourceHeight * scale
  const fittedWidth = rotatedWidth * scale
  const fittedHeight = rotatedHeight * scale
  const left = cell.x + (cell.width - fittedWidth) / 2
  const bottom = cell.y + (cell.height - fittedHeight) / 2

  // /Rotate is clockwise; pdf-lib draws counter-clockwise around the origin.
  const drawX = rotation === 180 ? left + width : rotation === 270 ? left + height : left
  const drawY = rotation === 180 ? bottom + height : rotation === 90 ? bottom + width : bottom
  return { x: left, y: bottom, width, height, fittedWidth, fittedHeight, drawX, drawY, rotation }
}

function drawRotated(page, embedded, sourcePage, cell) {
  const sourceSize = sourcePage.getSize()
  const placement = calculatePagePlacement(sourceSize.width, sourceSize.height, sourcePage.getRotation().angle, cell)
  page.drawPage(embedded, {
    x: placement.drawX, y: placement.drawY, width: placement.width, height: placement.height,
    rotate: degrees(-placement.rotation),
  })
  return { x: placement.x, y: placement.y, width: placement.fittedWidth, height: placement.fittedHeight }
}

export async function exportMultiPagePdf(sourceBytes, options, onProgress) {
  const source = await PDFDocument.load(sourceBytes.slice(0))
  const sourcePages = source.getPages()
  const first = sourcePages[0]
  const firstRotation = normalizedRotation(first.getRotation().angle)
  const originalSize = firstRotation % 180
    ? { width: first.getSize().height, height: first.getSize().width }
    : first.getSize()
  const layout = calculateLayout({ ...options, pageCount: sourcePages.length, originalSize })
  const output = await PDFDocument.create()
  const labelFont = options.labels ? await output.embedFont(StandardFonts.Helvetica) : null

  for (let sheet = 0; sheet < layout.totalSheets; sheet += 1) {
    const start = sheet * layout.pagesPerSheet
    const end = Math.min(start + layout.pagesPerSheet, sourcePages.length)
    const indices = Array.from({ length: end - start }, (_, offset) => start + offset)
    const embeddedPages = await output.embedPages(indices.map((index) => sourcePages[index]))
    const outPage = output.addPage([layout.width, layout.height])
    for (let offset = 0; offset < indices.length; offset += 1) {
      const sourceIndex = indices[offset]
      const cell = getCellRect(layout, offset)
      const fitted = drawRotated(outPage, embeddedPages[offset], sourcePages[sourceIndex], cell)
      if (options.borders) {
        outPage.drawRectangle({ x: cell.x, y: cell.y, width: cell.width, height: cell.height, borderColor: rgb(0.72, 0.75, 0.8), borderWidth: 0.5 })
      }
      if (labelFont) {
        const size = Math.min(9, Math.max(5, Math.min(cell.width, cell.height) * 0.035))
        outPage.drawText(`Page ${sourceIndex + 1}`, {
          x: cell.x + 3, y: cell.y + 3, size, font: labelFont,
          color: rgb(0.36, 0.39, 0.44),
          maxWidth: Math.max(8, cell.width - 6),
        })
      }
      // Fit calculations use the rotated source bounds and keep every page inside its cell.
      if (fitted.width > cell.width + 0.01 || fitted.height > cell.height + 0.01) throw new Error('A source page could not be fitted within its cell.')
    }
    onProgress?.({ completed: sheet + 1, total: layout.totalSheets })
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { bytes: await output.save({ useObjectStreams: true, addDefaultPage: false }), layout }
}
