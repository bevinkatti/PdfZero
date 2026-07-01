export const DEFAULT_BASE_SCALE = 1.5

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
const round2 = (value) => Math.round(value * 100) / 100

export function textChars(text = '') {
  return [...String(text)]
}

export function splitTextLines(text = '') {
  return String(text).replace(/\r/g, '').split('\n')
}

function estimatedCharWeight(ch) {
  if (ch === ' ') return 0.36
  if (/[ilI.,:;|'`!]/.test(ch)) return 0.32
  if (/[mwMW@#%&]/.test(ch)) return 0.92
  if (/[0-9]/.test(ch)) return 0.58
  if (/[A-Z]/.test(ch)) return 0.68
  return 0.56
}

export function estimateGlyphsForRun(text = '', width = 0, fontSize = 12) {
  const chars = textChars(text)
  if (!chars.length) return []

  const weights = chars.map(estimatedCharWeight)
  const estimatedWidth = weights.reduce((sum, weight) => sum + weight * fontSize, 0)
  const scale = estimatedWidth > 0 && width > 0 ? width / estimatedWidth : 1
  let xOffset = 0

  return chars.map((unicode, index) => {
    const advance = round2(weights[index] * fontSize * scale)
    const glyph = {
      index,
      unicode,
      advance,
      xOffset: round2(xOffset),
      tjAdjustment: 0,
      canReuseOriginalGlyph: true,
    }
    xOffset += advance
    return glyph
  })
}

export function buildExtractedTextMetrics(item, geom, baseScale = DEFAULT_BASE_SCALE) {
  const originalWidth = round2(geom.width)
  const originalHeight = round2(geom.height)
  const glyphs = estimateGlyphsForRun(item.str || '', originalWidth, geom.fontSize)

  return {
    originalStr: item.str || '',
    originalWidth,
    originalHeight,
    originalFontSize: round2(geom.fontSize),
    originalBaselineOffset: round2(geom.baselineOffset),
    lineHeight: originalHeight,
    maxEditWidth: originalWidth,
    maxEditHeight: originalHeight,
    naturalGlyphCount: glyphs.length,
    averageAdvance: glyphs.length ? round2(originalWidth / glyphs.length) : 0,
    widthPts: round2(originalWidth / baseScale),
    heightPts: round2(originalHeight / baseScale),
    glyphs,
    kerning: [],
    kerningSource: 'pdfjs-estimated',
  }
}

export function getOriginalBox(block = {}) {
  const fontSize = block.originalFontSize ?? block.fontSize ?? 12
  return {
    x: block.originalX ?? block.x ?? 0,
    y: block.originalY ?? block.y ?? 0,
    width: block.originalWidth ?? block.width ?? fontSize * 4,
    height: block.originalHeight ?? block.height ?? fontSize,
    fontSize,
    baselineOffset: block.originalBaselineOffset ?? block.baselineOffset ?? fontSize * 0.8,
    lineHeight: block.originalLineHeight ?? block.lineHeight ?? block.height ?? fontSize * 1.1,
  }
}

export function measureLineWidth(font, text, size) {
  if (!text) return 0
  try {
    return font.widthOfTextAtSize(text, size)
  } catch {
    return textChars(text).length * size * 0.55
  }
}

export function planSingleLineFit({
  block,
  text,
  font,
  size,
  baseScale = DEFAULT_BASE_SCALE,
  preserveWidth = true,
}) {
  const naturalWidth = measureLineWidth(font, text, size)
  const originalBox = getOriginalBox(block)
  const targetWidth = preserveWidth ? Math.max(originalBox.width / baseScale, 0.1) : naturalWidth
  const chars = textChars(text)
  const slots = Math.max(chars.length - 1, 0)
  const tolerance = Math.max(0.35, size * 0.025)

  if (!preserveWidth || !targetWidth || chars.length <= 1) {
    return {
      text,
      size,
      naturalWidth,
      targetWidth,
      characterSpacing: 0,
      width: naturalWidth,
      overflow: preserveWidth && naturalWidth > targetWidth + tolerance,
      status: naturalWidth > targetWidth + tolerance ? 'overflow' : 'natural',
    }
  }

  const spacing = slots ? (targetWidth - naturalWidth) / slots : 0
  const minSpacing = -size * 0.18
  const maxSpacing = size * 0.32

  if (spacing >= minSpacing && spacing <= maxSpacing) {
    return {
      text,
      size,
      naturalWidth,
      targetWidth,
      characterSpacing: spacing,
      width: targetWidth,
      overflow: false,
      status: Math.abs(spacing) <= tolerance ? 'natural' : 'tracking-fit',
    }
  }

  if (naturalWidth > targetWidth) {
    const fittedSize = clamp(size * (targetWidth / naturalWidth), size * 0.88, size)
    const fittedWidth = measureLineWidth(font, text, fittedSize)
    const fittedSpacing = slots ? (targetWidth - fittedWidth) / slots : 0
    if (fittedSpacing >= minSpacing && fittedSpacing <= maxSpacing) {
      return {
        text,
        size: fittedSize,
        naturalWidth,
        targetWidth,
        characterSpacing: fittedSpacing,
        width: targetWidth,
        overflow: false,
        status: fittedSize === size ? 'tracking-fit' : 'size-fit',
      }
    }
  }

  return {
    text,
    size,
    naturalWidth,
    targetWidth,
    characterSpacing: clamp(spacing, minSpacing, maxSpacing),
    width: naturalWidth + clamp(spacing, minSpacing, maxSpacing) * slots,
    overflow: naturalWidth > targetWidth + tolerance,
    status: 'overflow',
  }
}

export function layoutTextForBlock({
  block,
  text,
  font,
  size,
  baseScale = DEFAULT_BASE_SCALE,
  preserveWidth = true,
}) {
  const lines = splitTextLines(text)
  const originalBox = getOriginalBox(block)
  const lineHeight = Math.max((originalBox.lineHeight || originalBox.height) / baseScale, size * 1.05)
  const maxLines = Math.max(1, Math.floor(Math.max(originalBox.height, originalBox.lineHeight) / Math.max(originalBox.lineHeight, 1)))
  const fittedLines = lines.map((line) => planSingleLineFit({
    block,
    text: line,
    font,
    size,
    baseScale,
    preserveWidth,
  }))
  const overflow = fittedLines.some((line) => line.overflow) || lines.length > maxLines

  return {
    lines: fittedLines,
    lineHeight,
    maxLines,
    overflow,
    status: overflow ? 'overflow' : fittedLines.some((line) => line.status !== 'natural') ? 'fit' : 'natural',
  }
}
