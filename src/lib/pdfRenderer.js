import * as pdfjsLib from 'pdfjs-dist'
import { buildExtractedTextMetrics, estimateGlyphsForRun } from './pdfTextLayout.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

let pdfDocument = null
const pageCache    = {}   // pageNum → PDFPageProxy
const fontMapCache = {}   // pageNum → { internalId: realName }

export async function loadPdf(arrayBuffer) {
  const copy = arrayBuffer.slice(0)
  pdfDocument = await pdfjsLib.getDocument({ data: copy }).promise
  // Clear all caches on new file
  Object.keys(pageCache).forEach(k => delete pageCache[k])
  Object.keys(fontMapCache).forEach(k => delete fontMapCache[k])
  return pdfDocument
}

export function getPdfDocument() { return pdfDocument }

async function getPage(pageNum) {
  if (!pdfDocument) throw new Error('No PDF loaded')
  if (!pageCache[pageNum]) pageCache[pageNum] = await pdfDocument.getPage(pageNum)
  return pageCache[pageNum]
}

export const BASE_SCALE = 1.5

// ─── Font classification ───────────────────────────────────────────────────
// Maps any font name (real or internal) to: CSS stack, pdf-lib family, bold, italic
export function classifyFont(rawName) {
  if (!rawName) return _fallback()
  if (/^g_d\d+_f\d+$/.test(rawName)) return _fallback()

  // Strip common prefixes/suffixes that don't affect font family
  const n = rawName
    .replace(/^[A-Z]{6}\+/, '')   // BCDFEE+Arial → Arial
    .replace(/PSMT$/i,  '')        // TimesNewRomanPSMT → TimesNewRoman
    .replace(/PS$/i,    '')        // TimesNewRomanPS → TimesNewRoman
    .replace(/MT$/i,    '')        // ArialMT → Arial, TimesNewRomanPS-BoldMT → TimesNewRomanPS-Bold
    .replace(/Std$/i,   '')
    .replace(/Pro$/i,   '')
    .replace(/Linotype$/i, '')
    .replace(/LT$/i,    '')

  // Detect bold/italic from name
  const bold   = /bold|heavy|black|semibold|demi|extrab/i.test(n)
  const italic = /italic|oblique|(-it)($|[^a-z])/i.test(n)

  // ── 1. Times New Roman and Roman/Serif families ──────────────────────────
  // Must come before Arial check since "TimesNewRomanPS-BoldMT" is the real
  // name returned by commonObjs.name for the heading font in the NSS PDF.
  if (/times|roman(?!ia)|timesnew|garamond|palatino|cambria|caslon|baskerville|bookman|charter|minion|constantia|utopia|warnock|didot/i.test(n)) {
    let css = '"Times New Roman", "Noto Serif", Times, serif'
    if (/georgia/i.test(n))   css = 'Georgia, "Noto Serif", serif'
    if (/garamond/i.test(n))  css = '"EB Garamond", "Noto Serif", serif'
    if (/palatino/i.test(n))  css = '"Palatino Linotype", "Noto Serif", serif'
    if (/cambria/i.test(n))   css = 'Cambria, "Noto Serif", serif'
    return { family: 'Times-Roman', bold, italic, css }
  }
  if (/georgia/i.test(n)) {
    return { family: 'Times-Roman', bold, italic, css: 'Georgia, "Noto Serif", serif' }
  }

  // ── 2. Courier / Monospace ────────────────────────────────────────────────
  if (/courier|cour(?=\b)|mono(?!tone)|typewriter|consolas|inconsolata|sourcecodesans|lucidaconsole|andale/i.test(n)) {
    return { family: 'Courier', bold, italic, css: '"Courier New", Courier, monospace' }
  }

  // ── 3. Arial — must be explicit before the broad sans-serif catch ─────────
  if (/^arial/i.test(n)) {
    return { family: 'Helvetica', bold, italic, css: 'Arial, "Noto Sans", Helvetica, sans-serif' }
  }

  // ── 4. Helvetica ──────────────────────────────────────────────────────────
  if (/^helvetica/i.test(n)) {
    return { family: 'Helvetica', bold, italic, css: 'Helvetica, Arial, sans-serif' }
  }

  // ── 5. Comic Sans ─────────────────────────────────────────────────────────
  if (/comic/i.test(n)) {
    return { family: 'Helvetica', bold, italic, css: '"Comic Sans MS", cursive, sans-serif' }
  }

  // ── 6. Impact / condensed display ─────────────────────────────────────────
  if (/^impact/i.test(n) || /arialnarrow/i.test(n)) {
    return { family: 'Helvetica', bold: true, italic, css: 'Impact, "Arial Narrow", sans-serif' }
  }

  // ── 7. Geometric / Humanist sans ─────────────────────────────────────────
  if (/futura|avenir|gillsans|centurygothic|optima|myriad|frutiger|univers/i.test(n)) {
    return { family: 'Helvetica', bold, italic, css: '"Century Gothic", Arial, sans-serif' }
  }

  // ── 8. Calibri / Candara / Corbel ─────────────────────────────────────────
  if (/calibri/i.test(n))  return { family: 'Helvetica', bold, italic, css: 'Calibri, Arial, sans-serif' }
  if (/candara/i.test(n))  return { family: 'Helvetica', bold, italic, css: 'Candara, Arial, sans-serif' }

  // ── 9. Verdana / Tahoma / Trebuchet ───────────────────────────────────────
  if (/verdana/i.test(n))   return { family: 'Helvetica', bold, italic, css: 'Verdana, Arial, sans-serif' }
  if (/tahoma/i.test(n))    return { family: 'Helvetica', bold, italic, css: 'Tahoma, Arial, sans-serif' }
  if (/trebuchet/i.test(n)) return { family: 'Helvetica', bold, italic, css: '"Trebuchet MS", Arial, sans-serif' }

  // ── 10. Common sans-serif web fonts ───────────────────────────────────────
  if (/roboto|opensans|lato|montserrat|raleway|nunito|sourcesans|notosans|inter(?=\b|-)|ubuntu(?=\b)|franklin|gothic/i.test(n)) {
    return { family: 'Helvetica', bold, italic, css: 'Arial, "Noto Sans", Helvetica, sans-serif' }
  }

  // ── 11. Noto family ───────────────────────────────────────────────────────
  if (/notoserif/i.test(n)) return { family: 'Times-Roman', bold, italic, css: '"Noto Serif", Georgia, serif' }
  if (/notosans/i.test(n))  return { family: 'Helvetica',   bold, italic, css: '"Noto Sans", Arial, sans-serif' }

  // ── 12. Generic fallback by keyword ───────────────────────────────────────
  if (/sans/i.test(n))  return { family: 'Helvetica',   bold, italic, css: 'Arial, "Noto Sans", Helvetica, sans-serif' }
  if (/serif/i.test(n)) return { family: 'Times-Roman', bold, italic, css: '"Times New Roman", "Noto Serif", serif' }
  if (/mono/i.test(n))  return { family: 'Courier',     bold, italic, css: '"Courier New", monospace' }

  // ── 13. Complete unknown ──────────────────────────────────────────────────
  return { family: 'Helvetica', bold, italic, css: 'Arial, "Noto Sans", Helvetica, sans-serif' }
}

function _fallback() {
  return { family: 'Helvetica', bold: false, italic: false, css: 'Arial, Helvetica, sans-serif' }
}

// ─── Resolve real font names ──────────────────────────────────────────────
// Strategy:
// 1. Parse the page's operator list for 'dependency' font objects
//    that PDF.js has already loaded (most reliable, no extra render needed)
// 2. Fall back to commonObjs after a proper-scale render
// 3. Fall back to raw PDF binary parsing for the document-level font dict
const round2 = n => Math.round(n * 100) / 100

function cleanFontName(name) {
  return (name || '')
    .replace(/^[A-Z]{6}\+/, '')
    .replace(/^["']|["']$/g, '')
}

function fontNameFromStyle(style) {
  if (!style) return ''
  const raw = style.fontFamily || style.loadedName || style.name || ''
  if (!raw || /^g_d\d+_f\d+/.test(raw)) return ''
  return cleanFontName(raw)
}

function textGeometry(item, tx, style) {
  const scaleY = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3])
  const scaleX = Math.sqrt(tx[0] * tx[0] + tx[1] * tx[1])
  const itemHeight = Math.abs(item.height || 0) * BASE_SCALE
  const fontSize = Math.max(scaleY || itemHeight || scaleX, 4)
  const ascent = Number.isFinite(style?.ascent) ? style.ascent : 0.8
  const descent = Number.isFinite(style?.descent) ? style.descent : -0.2
  const baselineOffset = fontSize * ascent
  const height = Math.max(fontSize * (ascent - descent), fontSize * 0.85, 6)
  const width = Math.max(Math.abs(item.width || 0) * BASE_SCALE, fontSize * 0.4)

  return {
    x: tx[4],
    y: tx[5] - baselineOffset,
    width,
    height,
    fontSize,
    baselineOffset,
    ascent,
    descent,
    scaleX,
    scaleY,
  }
}

async function resolveFontNames(page, pageNum) {
  if (fontMapCache[pageNum]) return fontMapCache[pageNum]
  const map = {}

  const tc      = await page.getTextContent({ includeMarkedContent: false })
  const fontIds = [...new Set(tc.items.map(i => i.fontName).filter(Boolean))]
  if (!fontIds.length) { fontMapCache[pageNum] = map; return map }

  // ── Method 1: Read font objects that PDF.js loaded during getOperatorList ──
  // getOperatorList causes PDF.js to load all font resources for the page.
  // After it resolves, the font objects are in commonObjs.
  try {
    await page.getOperatorList()  // ensures fonts are loaded into commonObjs
  } catch (_) {}

  // Now try to read commonObjs synchronously (they should be ready)
  await Promise.allSettled(fontIds.map(fontId =>
    new Promise(resolve => {
      try {
        page.commonObjs.get(fontId, (obj) => {
          if (obj) {
            const realName = obj.name || obj.loadedName || ''
            // Only accept names that look like real font names (not internal IDs)
            if (realName && !realName.match(/^g_d\d+_/)) {
              map[fontId] = realName.replace(/^[A-Z]{6}\+/, '')  // strip subset prefix
            }
          }
          resolve()
        })
      } catch { resolve() }
      setTimeout(resolve, 1200)  // longer timeout for slow connections
    })
  ))

  // ── Method 2: Render at visible scale then retry unresolved fonts ──
  const unresolved = fontIds.filter(id => !map[id])
  if (unresolved.length > 0) {
    try {
      const vp = page.getViewport({ scale: 0.5 })  // must be visible to load fonts
      const tmp = document.createElement('canvas')
      tmp.width  = Math.round(vp.width)
      tmp.height = Math.round(vp.height)
      await page.render({ canvasContext: tmp.getContext('2d'), viewport: vp }).promise

      await Promise.allSettled(unresolved.map(fontId =>
        new Promise(resolve => {
          try {
            page.commonObjs.get(fontId, (obj) => {
              if (obj) {
                const realName = obj.name || obj.loadedName || ''
                if (realName && !realName.match(/^g_d\d+_/)) {
                  map[fontId] = realName.replace(/^[A-Z]{6}\+/, '')
                }
              }
              resolve()
            })
          } catch { resolve() }
          setTimeout(resolve, 1500)
        })
      ))
    } catch (_) {}
  }

  fontMapCache[pageNum] = map
  return map
}

// ─── Color extraction from page operator list ─────────────────────────────
async function extractColors(page) {
  const opList   = await page.getOperatorList()
  const OPS      = pdfjsLib.OPS
  const colorMap = {}   // textItemIndex → hex color
  let curColor   = '#000000'
  let textIdx    = 0

  const toH = v => Math.round(Math.min(Math.max(v,0),1)*255).toString(16).padStart(2,'0')
  const rgb  = (r,g,b) => '#'+toH(r)+toH(g)+toH(b)
  const gray = g => rgb(g,g,g)
  const cmyk = (c,m,y,k) => rgb((1-c)*(1-k),(1-m)*(1-k),(1-y)*(1-k))

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn   = opList.fnArray[i]
    const args = opList.argsArray[i] || []
    if      (fn === OPS.setFillRGBColor  && args.length >= 3) curColor = rgb(args[0],args[1],args[2])
    else if (fn === OPS.setFillGray      && args.length >= 1) curColor = gray(args[0])
    else if (fn === OPS.setFillCMYKColor && args.length >= 4) curColor = cmyk(args[0],args[1],args[2],args[3])
    else if (fn === OPS.setFillColor     && args.length >= 3 && args[0]<=1) curColor = rgb(args[0],args[1],args[2])
    else if (fn === OPS.setFillColorN    && args.length >= 3 && args[0]<=1) curColor = rgb(args[0],args[1],args[2])
    else if ([
      OPS.showText, OPS.showSpacedText,
      OPS.nextLineShowText, OPS.nextLineSetSpacingShowText,
    ].includes(fn)) {
      colorMap[textIdx++] = curColor
    }
  }
  return colorMap
}

// ─── Main text extraction ─────────────────────────────────────────────────
export async function extractTextItems(pageNum) {
  if (!pdfDocument) return []
  const page     = await getPage(pageNum)
  const viewport = page.getViewport({ scale: BASE_SCALE })

  // Run font resolution + color + size inference in parallel
  const [fontNames, colorMap, fontSizeInfo] = await Promise.all([
    resolveFontNames(page, pageNum).catch(() => ({})),
    extractColors(page).catch(() => ({})),
    inferFontProperties(page).catch(() => ({})),
  ])

  const tc = await page.getTextContent({ includeMarkedContent: false })
  const raw = []
  let idx = 0

  for (const item of tc.items) {
    if (!item.str?.trim()) { idx++; continue }

    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
    const internalId = item.fontName || ''
    const style = tc.styles?.[internalId]
    const geom = textGeometry(item, tx, style)
    const fontSize = geom.fontSize
    const x        = geom.x
    const y        = geom.y

    if (!isFinite(x) || !isFinite(y) || x < -300 || y < -300) { idx++; continue }

    // Real font name: resolved name > inference from size > internal id
    let realName = cleanFontName(fontNames[internalId] || fontNameFromStyle(style))

    // If name resolution failed (still have internal ID), infer from size data
    let inferredBold   = false
    let inferredItalic = false
    if (!realName && fontSizeInfo[internalId]) {
      const { maxSize } = fontSizeInfo[internalId]
      // Heuristic: if this font is used at large sizes, it's likely a heading font
      // We can't determine bold/italic without the name, but we preserve the internal ID
      // so classifyFont can return a neutral sans-serif fallback
      inferredBold = maxSize > 16  // large font used — probably bold heading
    }

    const fontInfo = classifyFont(realName || internalId || '')
    // Override bold if inferred (only when we don't have a real name)
    if (!realName && inferredBold) fontInfo.bold = true

    const textMetrics = buildExtractedTextMetrics(item, geom, BASE_SCALE)
    const rotation = Math.atan2(tx[1] || 0, tx[0] || 1) * 180 / Math.PI

    raw.push({
      id:          `txt-${pageNum}-${idx}`,
      str:         item.str,
      originalStr: item.str,
      x,
      y,
      width:       round2(geom.width),
      height:      round2(geom.height),
      fontSize:    round2(fontSize),
      lineHeight:  round2(geom.height),
      baselineOffset: round2(geom.baselineOffset),
      ascent:      round2(geom.ascent),
      descent:     round2(geom.descent),
      scaleX:      round2(geom.scaleX),
      scaleY:      round2(geom.scaleY),
      rotation:    round2(rotation),
      textMatrix:  item.transform,
      transform:   tx.map(round2),
      // Font info for display
      fontName:    realName || internalId,
      internalFontName: internalId,
      embeddedFontName: realName || '',
      fontFamily:  fontInfo.css,
      fontBold:    fontInfo.bold,
      fontItalic:  fontInfo.italic,
      fontWeight:  fontInfo.bold ? 'bold' : 'normal',
      fontStyle:   fontInfo.italic ? 'italic' : 'normal',
      fontResource: {
        internalName: internalId,
        resolvedName: realName || '',
        cssFamily: fontInfo.css,
        standardFallback: fontInfo.family,
        embedded: Boolean(realName),
        subset: /^[A-Z]{6}\+/.test(fontNames[internalId] || ''),
        source: realName ? 'pdfjs-commonObjs' : 'fallback-classifier',
      },
      // For pdf-lib export
      stdFont:     fontInfo.family,
      operatorColor: colorMap[idx] || null,
      color:       colorMap[idx] || '#000000',
      colorSource: colorMap[idx] ? 'operator-list' : 'default',
      colorSpace:  'DeviceRGB',
      fillOpacity: 1,
      textRenderingMode: 0,
      charSpacing: 0,
      wordSpacing: 0,
      horizontalScale: 1,
      editBox: {
        x,
        y,
        width: round2(geom.width),
        height: round2(geom.height),
        baseline: round2(y + geom.baselineOffset),
        maxWidth: round2(geom.width),
        maxHeight: round2(geom.height),
      },
      ...textMetrics,
      isExtracted: true,
    })
    idx++
  }

  // Merge adjacent fragments on same line with same font into logical runs
  return mergeLineFragments(raw)
}

// ─── Merge adjacent same-font same-line fragments ─────────────────────────
// Handles PDFs where "2024-25" is stored as ["2024", "-", "25"] etc.
function mergeLineFragments(items) {
  if (!items.length) return items
  const out = []
  let i = 0

  while (i < items.length) {
    let curr = { ...items[i], children: [items[i].id] }
    let j = i + 1

    while (j < items.length) {
      const next     = items[j]
      const sameFont = next.fontName === curr.fontName && next.fontBold === curr.fontBold && next.fontItalic === curr.fontItalic
      const sameColor = (next.color || '#000000').toLowerCase() === (curr.color || '#000000').toLowerCase()
      const currBaseline = curr.y + (curr.baselineOffset || curr.fontSize * 0.8)
      const nextBaseline = next.y + (next.baselineOffset || next.fontSize * 0.8)
      const sameLine = Math.abs(nextBaseline - currBaseline) < curr.fontSize * 0.35
      const currRight = curr.x + curr.width
      const gap       = next.x - currRight
      // Merge if: same font, same line, not too far apart (allow up to 1 em gap)
      const adjacent  = gap >= -2 && gap < curr.fontSize * 1.2

      if (sameFont && sameColor && sameLine && adjacent) {
        const spacer = gap > curr.fontSize * 0.25 ? ' ' : ''
        const mergedText = curr.str + spacer + next.str
        const mergedWidth = (next.x + next.width) - curr.x
        const mergedHeight = Math.max(curr.height, next.height)
        curr = {
          ...curr,
          str:      mergedText,
          originalStr: mergedText,
          width:    mergedWidth,
          height:   mergedHeight,
          originalWidth: round2(mergedWidth),
          originalHeight: round2(mergedHeight),
          maxEditWidth: round2(mergedWidth),
          maxEditHeight: round2(mergedHeight),
          widthPts: round2(mergedWidth / BASE_SCALE),
          heightPts: round2(mergedHeight / BASE_SCALE),
          naturalGlyphCount: [...mergedText].length,
          averageAdvance: [...mergedText].length ? round2(mergedWidth / [...mergedText].length) : 0,
          lineHeight: round2(Math.max(curr.lineHeight || curr.height, next.lineHeight || next.height)),
          baselineOffset: Math.max(curr.baselineOffset || curr.fontSize * 0.8, next.baselineOffset || next.fontSize * 0.8),
          children: [...curr.children, next.id],
          fragments: [...(curr.fragments || [items[i]]), next],
          glyphs: estimateGlyphsForRun(mergedText, mergedWidth, curr.fontSize),
          editBox: {
            ...(curr.editBox || {}),
            x: curr.x,
            y: curr.y,
            width: round2(mergedWidth),
            height: round2(mergedHeight),
            baseline: round2(curr.y + Math.max(curr.baselineOffset || curr.fontSize * 0.8, next.baselineOffset || next.fontSize * 0.8)),
            maxWidth: round2(mergedWidth),
            maxHeight: round2(mergedHeight),
          },
        }
        j++
      } else {
        break
      }
    }

    out.push(curr)
    i = j
  }
  return out
}

// ─── Page render ──────────────────────────────────────────────────────────
export async function renderPage(pageNum, zoom = 1) {
  const page     = await getPage(pageNum)
  const scale    = BASE_SCALE * zoom
  const viewport = page.getViewport({ scale })
  const dpr      = Math.min(window.devicePixelRatio || 1, 2)

  const canvas  = document.createElement('canvas')
  canvas.width  = Math.round(viewport.width  * dpr)
  canvas.height = Math.round(viewport.height * dpr)

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  await page.render({ canvasContext: ctx, viewport }).promise
  return { canvas, width: viewport.width, height: viewport.height }
}

// ─── Background colour sampling ───────────────────────────────────────────
export function detectPageBackground(canvas) {
  try {
    const ctx = canvas.getContext('2d')
    const w = canvas.width, h = canvas.height
    const pts = [
      [2,2], [w-3,2], [2,h-3], [w-3,h-3], [w>>1,4],
    ]
    const avg = pts
      .map(([x,y]) => ctx.getImageData(x,y,1,1).data)
      .reduce((a,d) => [a[0]+d[0], a[1]+d[1], a[2]+d[2]], [0,0,0])
      .map(v => Math.round(v / pts.length))
    return `rgb(${avg[0]},${avg[1]},${avg[2]})`
  } catch { return 'white' }
}

// ─── Local background sampling at a specific region ───────────────────────
// Samples the canvas DENSELY along all 4 edges of a text block's bounding box
// to determine the actual local background color.
//
// COORDINATE NOTE: text block positions (x, y, w, h) are in BASE_SCALE space
// (since extractTextItems uses viewport at BASE_SCALE). The canvas pixel buffer
// is at BASE_SCALE * zoom * dpr, so the conversion factor from text coords to
// canvas pixels is just `zoom * dpr` (BASE_SCALE is already baked in).
//
// Pass scale = zoom * dpr (NOT BASE_SCALE * zoom * dpr).
export function sampleLocalBackground(canvas, x, y, w, h, scale = 1) {
  try {
    const ctx = canvas.getContext('2d')
    const cw = canvas.width, ch = canvas.height

    // Convert text-block coords to canvas pixel coords
    const sx = Math.round(x * scale)
    const sy = Math.round(y * scale)
    const sw = Math.round(w * scale)
    const sh = Math.round(h * scale)

    // Build a dense list of sample points along all 4 edges, offset 2px
    // outside the text bounding box to avoid sampling actual text pixels.
    const offset = Math.round(2 * scale)  // 2px outside in text space
    const step = Math.max(Math.round(4 * scale), 2)  // sample every ~4px in text space
    const pts = []

    // Top edge (y = sy - offset, x varies)
    for (let px = sx; px <= sx + sw; px += step) {
      pts.push([px, sy - offset])
    }
    // Bottom edge (y = sy + sh + offset, x varies)
    for (let px = sx; px <= sx + sw; px += step) {
      pts.push([px, sy + sh + offset])
    }
    // Left edge (x = sx - offset, y varies)
    for (let py = sy; py <= sy + sh; py += step) {
      pts.push([sx - offset, py])
    }
    // Right edge (x = sx + sw + offset, y varies)
    for (let py = sy; py <= sy + sh; py += step) {
      pts.push([sx + sw + offset, py])
    }

    // Filter to valid canvas coordinates
    const valid = pts.filter(([px, py]) => px >= 0 && px < cw && py >= 0 && py < ch)
    if (!valid.length) return null

    // Read all pixel colors
    const colors = valid.map(([px, py]) => {
      const d = ctx.getImageData(px, py, 1, 1).data
      return [d[0], d[1], d[2]]
    })

    // Use median of each channel (robust against text/edge outliers)
    const median = ch => {
      const sorted = colors.map(c => c[ch]).sort((a, b) => a - b)
      const mid = sorted.length >> 1
      return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    }

    return `rgb(${median(0)},${median(1)},${median(2)})`
  } catch { return null }
}

function parseCssRgb(color) {
  if (!color) return null
  if (color.startsWith('#')) {
    const hex = color.slice(1).padEnd(6, '0')
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }
  const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

function toHexColor([r, g, b]) {
  const h = v => Math.round(Math.min(Math.max(v, 0), 255)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function colorDistance(a, b) {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

// Rendered text color is often more reliable than operator-list color mapping:
// PDF.js text items and PDF show-text operators do not always line up 1:1.
export function sampleTextColor(canvas, x, y, w, h, scale = 1, fallbackBg = 'white') {
  try {
    const ctx = canvas.getContext('2d')
    const cw = canvas.width, ch = canvas.height
    const pad = Math.max(1, Math.round(1.5 * scale))
    const sx = Math.max(0, Math.floor(x * scale) - pad)
    const sy = Math.max(0, Math.floor(y * scale) - pad)
    const sw = Math.min(cw - sx, Math.ceil(w * scale) + pad * 2)
    const sh = Math.min(ch - sy, Math.ceil(h * scale) + pad * 2)
    if (sw <= 1 || sh <= 1) return null

    const bg = parseCssRgb(sampleLocalBackground(canvas, x, y, w, h, scale) || fallbackBg) || [255, 255, 255]
    const data = ctx.getImageData(sx, sy, sw, sh).data
    const samples = []
    const stride = sw * sh > 12000 ? 2 : 1

    for (let py = 0; py < sh; py += stride) {
      for (let px = 0; px < sw; px += stride) {
        const i = (py * sw + px) * 4
        const alpha = data[i + 3]
        if (alpha < 32) continue
        const rgb = [data[i], data[i + 1], data[i + 2]]
        const dist = colorDistance(rgb, bg)
        if (dist < 35) continue
        samples.push({ rgb, weight: dist * dist })
      }
    }

    if (samples.length < 4) return null

    const totals = samples.reduce((acc, sample) => {
      acc[0] += sample.rgb[0] * sample.weight
      acc[1] += sample.rgb[1] * sample.weight
      acc[2] += sample.rgb[2] * sample.weight
      acc[3] += sample.weight
      return acc
    }, [0, 0, 0, 0])

    if (!totals[3]) return null
    const sampled = [totals[0] / totals[3], totals[1] / totals[3], totals[2] / totals[3]]

    // Reject near-background noise; real glyph ink should still differ clearly.
    if (colorDistance(sampled, bg) < 30) return null
    return toHexColor(sampled)
  } catch {
    return null
  }
}

export function applyCanvasTextColors(items, canvas, scale = 1, fallbackBg = 'white') {
  if (!canvas || !items?.length) return items || []

  return items.map(item => {
    const sampled = sampleTextColor(canvas, item.x, item.y, item.width, item.height, scale, fallbackBg)
    if (!sampled) return item
    if ((item.color || '').toLowerCase() === sampled.toLowerCase() && item.colorSource === 'canvas-sampled') {
      return item
    }
    return {
      ...item,
      operatorColor: item.operatorColor || item.color || null,
      color: sampled,
      colorSource: 'canvas-sampled',
    }
  })
}

export async function getPageBaseSize(pageNum) {
  const page = await getPage(pageNum)
  const vp   = page.getViewport({ scale: BASE_SCALE })
  return { width: vp.width, height: vp.height }
}

export async function renderThumbnail(pageNum) {
  const page     = await getPage(pageNum)
  const viewport = page.getViewport({ scale: 0.3 })
  const canvas   = document.createElement('canvas')
  canvas.width   = viewport.width
  canvas.height  = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.7)
}

// ─── Infer font properties from operator list when name resolution fails ──
// When commonObjs doesn't resolve font names, we can still infer bold/size
// by analysing which setFont calls are used for large text vs small text.
// Large font → likely a heading → likely bold.
// This is a heuristic but much better than defaulting everything to Helvetica Regular.
export async function inferFontProperties(page) {
  try {
    const opList = await page.getOperatorList()
    const OPS    = pdfjsLib.OPS
    const fontSizes = {}  // fontId → [sizes used]

    for (let i = 0; i < opList.fnArray.length; i++) {
      if (opList.fnArray[i] === OPS.setFont) {
        const [fontId, size] = opList.argsArray[i] || []
        if (fontId && size) {
          if (!fontSizes[fontId]) fontSizes[fontId] = []
          fontSizes[fontId].push(size)
        }
      }
    }

    // Compute median size per font
    const fontInfo = {}
    for (const [id, sizes] of Object.entries(fontSizes)) {
      const sorted = [...sizes].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const max    = sorted[sorted.length - 1]
      fontInfo[id] = { medianSize: median, maxSize: max, useCount: sizes.length }
    }
    return fontInfo
  } catch { return {} }
}
