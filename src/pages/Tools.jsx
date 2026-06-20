import React, { useState, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Scissors, Merge, FileDown, RotateCcw, ScanLine, Lock,
  Unlock, Droplets, EyeOff, Edit3, FileSearch, Layers,
  ChevronRight, Upload, FileText, X, Loader2, RotateCw, Image as ImageIcon,
  GripVertical, Check, ArrowLeft
} from 'lucide-react'
import Navbar from '../components/layout/Navbar.jsx'
import {
  mergePdfs, splitPdf, compressPdf, rotatePdf, rotateAllPages,
  addWatermark, extractPages, reorderPages, downloadBytes,
  compressPdfToTarget, protectPdf
} from '../lib/pdfExporter.js'
import { loadPdf, renderThumbnail, renderPage } from '../lib/pdfRenderer.js'
import { ocrCanvas } from '../lib/ocrEngine.js'
import styles from './Tools.module.css'

/* ─────────────────── shared helpers ─────────────────── */

function FileDropper({ onFile, file, onClear, multiple = false, label = 'Drop PDF here or click to browse' }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: multiple ? undefined : 1,
    onDrop: multiple
      ? (files) => onFile(files)
      : ([f]) => f && onFile(f),
  })

  if (!multiple && file) {
    return (
      <div className={styles.fileChip}>
        <FileText size={15} />
        <span className={styles.fileName}>{file.name}</span>
        <span className={styles.fileSize}>{(file.size / 1024).toFixed(0)} KB</span>
        <button className={styles.removeBtn} onClick={onClear}><X size={13} /></button>
      </div>
    )
  }

  return (
    <div {...getRootProps()} className={`${styles.dropArea} ${isDragActive ? styles.dropActive : ''}`}>
      <input {...getInputProps()} />
      <Upload size={28} />
      <span>{isDragActive ? 'Drop it!' : label}</span>
    </div>
  )
}

function ToolShell({ title, desc, children, wide = false }) {
  return (
    <div className={`${styles.toolUI} ${wide ? styles.toolUIWide : ''}`}>
      <h2 className={styles.toolUITitle}>{title}</h2>
      <p className={styles.toolUIDesc}>{desc}</p>
      {children}
    </div>
  )
}

function ActionBtn({ onClick, disabled, loading, icon: Icon, children }) {
  return (
    <button className={styles.actionBtn} onClick={onClick} disabled={disabled || loading}>
      {loading ? <Loader2 size={15} className={styles.spin} /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  )
}

const WATERMARK_FONT_OPTIONS = [
  { id: 'Helvetica', label: 'Helvetica / Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'Times-Roman', label: 'Times / Georgia', css: 'Georgia, "Times New Roman", serif' },
  { id: 'Courier', label: 'Courier Mono', css: '"Courier New", Courier, monospace' },
]

const WATERMARK_POSITION_PRESETS = [
  ['top-left', 'Top Left'],
  ['top', 'Top'],
  ['top-right', 'Top Right'],
  ['center', 'Center'],
  ['bottom-left', 'Bottom Left'],
  ['bottom', 'Bottom'],
  ['bottom-right', 'Bottom Right'],
]

let previewMeasureCtx = null

function getPreviewMeasureContext() {
  if (!previewMeasureCtx && typeof document !== 'undefined') {
    previewMeasureCtx = document.createElement('canvas').getContext('2d')
  }
  return previewMeasureCtx
}

function measurePreviewText(text, fontSize, fontFamily, bold, italic) {
  const ctx = getPreviewMeasureContext()
  if (!ctx) {
    return {
      width: Math.max((text || '').length * fontSize * 0.58, fontSize * 2),
      height: fontSize * 1.08,
    }
  }

  ctx.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${fontSize}px ${fontFamily}`
  return {
    width: Math.max(ctx.measureText(text || '').width, fontSize * 2),
    height: fontSize * 1.08,
  }
}

function parseWatermarkPages(mode, input, totalPages) {
  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1)
  if (mode === 'all') return allPages
  if (!input.trim()) throw new Error(mode === 'specific' ? 'Enter specific page numbers' : 'Enter page ranges')

  const pages = []
  for (const rawPart of input.split(',')) {
    const part = rawPart.trim()
    if (!part) continue

    if (mode === 'specific') {
      if (!/^\d+$/.test(part)) throw new Error('Specific pages must look like: 1, 3, 7')
      pages.push(Number(part))
      continue
    }

    if (/^\d+$/.test(part)) {
      pages.push(Number(part))
      continue
    }

    const match = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (!match) throw new Error('Ranges must look like: 1-3, 5, 8-10')
    const start = Number(match[1])
    const end = Number(match[2])
    if (end < start) throw new Error(`Invalid range: ${part}`)
    for (let page = start; page <= end; page += 1) pages.push(page)
  }

  const unique = [...new Set(pages)].sort((a, b) => a - b)
  if (!unique.length) throw new Error('No pages matched your selection')
  if (unique.some((page) => page < 1 || page > totalPages)) {
    throw new Error(`Page selection must stay within 1-${totalPages}`)
  }
  return unique
}

function getPresetPosition(preset, pageWidth, pageHeight, markWidth, markHeight, margin = 18) {
  switch (preset) {
    case 'top-left':
      return { x: margin, y: margin }
    case 'top-right':
      return { x: pageWidth - markWidth - margin, y: margin }
    case 'bottom-left':
      return { x: margin, y: pageHeight - markHeight - margin }
    case 'bottom-right':
      return { x: pageWidth - markWidth - margin, y: pageHeight - markHeight - margin }
    case 'top':
      return { x: (pageWidth - markWidth) / 2, y: margin }
    case 'bottom':
      return { x: (pageWidth - markWidth) / 2, y: pageHeight - markHeight - margin }
    case 'center':
    default:
      return { x: (pageWidth - markWidth) / 2, y: (pageHeight - markHeight) / 2 }
  }
}

function buildPreviewPlacements(pageWidth, pageHeight, markWidth, markHeight, options) {
  if (!options.tiled) {
    const base = getPresetPosition(options.positionPreset, pageWidth, pageHeight, markWidth, markHeight)
    return [{ x: base.x + options.offsetX, y: base.y + options.offsetY }]
  }

  const stepX = markWidth + Math.max(markWidth * 0.65, 24)
  const stepY = markHeight + Math.max(markHeight * 0.9, 18)
  const placements = []

  for (let row = 0, y = -markHeight * 0.3 + options.offsetY; y < pageHeight + markHeight; row += 1, y += stepY) {
    const rowShift = row % 2 === 0 ? 0 : stepX / 2
    for (let x = -markWidth * 0.4 + options.offsetX - rowShift; x < pageWidth + markWidth; x += stepX) {
      placements.push({ x, y })
    }
  }

  return placements.slice(0, 80)
}

/* ─────────────────── individual tools ─────────────────── */

function MergeTool() {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)

  const onDrop = useCallback((dropped) => {
    setFiles(prev => [...prev, ...dropped])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] },
    onDrop,
  })

  const handleMerge = async () => {
    if (files.length < 2) { toast.error('Add at least 2 PDFs'); return }
    setBusy(true)
    const tid = toast.loading(`Merging ${files.length} files...`)
    try {
      const buffers = await Promise.all(files.map(f => f.arrayBuffer()))
      const bytes = await mergePdfs(buffers)
      downloadBytes(bytes, 'merged.pdf')
      toast.success(`Done! Merged ${files.length} PDFs`, { id: tid })
    } catch (e) { toast.error('Merge failed: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Merge PDFs" desc="Combine multiple PDFs into one file. Add them below — order matters.">
      <div {...getRootProps()} className={`${styles.dropArea} ${isDragActive ? styles.dropActive : ''}`}>
        <input {...getInputProps()} />
        <Upload size={28} /><span>{isDragActive ? 'Drop!' : 'Drop PDFs here or click to add more'}</span>
      </div>
      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((f, i) => (
            <div key={i} className={styles.fileChip}>
              <span className={styles.fileIndex}>{i + 1}</span>
              <FileText size={14} />
              <span className={styles.fileName}>{f.name}</span>
              <span className={styles.fileSize}>{(f.size/1024).toFixed(0)} KB</span>
              <button className={styles.removeBtn} onClick={() => setFiles(fs => fs.filter((_,j)=>j!==i))}><X size={12}/></button>
            </div>
          ))}
        </div>
      )}
      <ActionBtn onClick={handleMerge} disabled={files.length < 2} loading={busy} icon={Merge}>
        Merge {files.length} PDFs → merged.pdf
      </ActionBtn>
    </ToolShell>
  )
}

function SplitTool() {
  const [file, setFile] = useState(null)
  const [mode, setMode] = useState('range') // range | every | all
  const [from, setFrom] = useState(1)
  const [to,   setTo]   = useState(1)
  const [every, setEvery] = useState(1)
  const [busy, setBusy] = useState(false)

  const handleSplit = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Splitting...')
    try {
      const buf = await file.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const total = doc.numPages
      let ranges = []

      if (mode === 'range')  ranges = [{ from, to: Math.min(to, total) }]
      if (mode === 'every')  { for (let i=1; i<=total; i+=every) ranges.push({ from: i, to: Math.min(i+every-1, total) }) }
      if (mode === 'all')    { for (let i=1; i<=total; i++) ranges.push({ from: i, to: i }) }

      const results = await splitPdf(buf, ranges)
      results.forEach((bytes, i) => downloadBytes(bytes, `split-part-${i+1}.pdf`))
      toast.success(`Split into ${results.length} file(s)`, { id: tid })
    } catch (e) { toast.error('Split failed: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Split PDF" desc="Split by page range, every N pages, or extract every page separately.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.modeRow}>
        {[['range','By range'],['every','Every N pages'],['all','All pages']].map(([v,l])=>(
          <button key={v} className={`${styles.modeBtn} ${mode===v?styles.modeBtnActive:''}`} onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      {mode === 'range' && (
        <div className={styles.rangeRow}>
          <label>From page <input type="number" min={1} value={from} onChange={e=>setFrom(+e.target.value)} className={styles.numInput}/></label>
          <label>To page   <input type="number" min={1} value={to}   onChange={e=>setTo(+e.target.value)}   className={styles.numInput}/></label>
        </div>
      )}
      {mode === 'every' && (
        <div className={styles.rangeRow}>
          <label>Split every <input type="number" min={1} value={every} onChange={e=>setEvery(+e.target.value)} className={styles.numInput}/> pages</label>
        </div>
      )}
      <ActionBtn onClick={handleSplit} disabled={!file} loading={busy} icon={Scissors}>Split PDF</ActionBtn>
    </ToolShell>
  )
}

function CompressTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [targetKb, setTargetKb] = useState('')
  const [preset, setPreset] = useState('balanced')
  const [progress, setProgress] = useState(null)

  const handleCompress = async () => {
    if (!file) return
    const targetBytes = targetKb ? Math.max(1, Number(targetKb)) * 1024 : null
    if (targetKb && (!Number.isFinite(targetBytes) || targetBytes <= 0)) {
      toast.error('Enter a valid target size in KB')
      return
    }
    if (targetBytes && targetBytes >= file.size) {
      toast.error('Target size must be smaller than the original file')
      return
    }

    setBusy(true)
    setProgress(null)
    const tid = toast.loading(targetBytes ? 'Optimizing toward target size...' : 'Compressing...')
    try {
      const buf   = await file.arrayBuffer()
      const output = targetBytes
        ? await compressPdfToTarget(buf, {
            targetBytes,
            preset,
            onProgress: (p) => {
              setProgress(p)
              toast.loading(`Attempt ${p.attempt}/${p.attempts} - page ${p.page}/${p.pages}`, { id: tid })
            },
          })
        : { bytes: await compressPdf(buf), mode: 'lossless', reachedTarget: true }
      const bytes = output.bytes
      const saved = ((file.size - bytes.byteLength) / file.size * 100).toFixed(1)
      const name  = `compressed-${file.name}`
      downloadBytes(bytes, name)
      setResult({ original: file.size, compressed: bytes.byteLength, saved, ...output, targetBytes })
      toast.success(output.reachedTarget ? `Compressed to ${(bytes.byteLength/1024).toFixed(0)} KB` : `Best possible: ${(bytes.byteLength/1024).toFixed(0)} KB`, { id: tid })
    } catch (e) { toast.error('Compress failed: ' + e.message, { id: tid }) }
    setProgress(null)
    setBusy(false)
  }

  return (
    <ToolShell title="Compress PDF" desc="Choose a target size and PDFZero will optimize visually toward it in-browser.">
      <FileDropper file={file} onFile={setFile} onClear={() => { setFile(null); setResult(null); setProgress(null) }} />
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Target size in KB</label>
          <input
            className={styles.formInput}
            type="number"
            min={1}
            value={targetKb}
            onChange={e=>setTargetKb(e.target.value)}
            placeholder={file ? `e.g. ${Math.max(50, Math.round(file.size / 1024 * 0.35))}` : 'e.g. 100'}
          />
        </div>
        <div className={styles.modeRow}>
          {[
            ['balanced', 'Balanced'],
            ['high', 'Better quality'],
            ['small', 'Smallest size'],
          ].map(([id, label]) => (
            <button key={id} className={`${styles.modeBtn} ${preset===id?styles.modeBtnActive:''}`} onClick={()=>setPreset(id)}>{label}</button>
          ))}
        </div>
      </div>
      {progress && (
        <div className={styles.progressBox}>
          <div className={styles.progressText}>Attempt {progress.attempt}/{progress.attempts} - page {progress.page}/{progress.pages}</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${((progress.page / progress.pages) * 100).toFixed(0)}%` }} />
          </div>
        </div>
      )}
      {result && (
        <div className={styles.resultBox}>
          <div className={styles.resultRow}><span>Original</span><strong>{(result.original/1024).toFixed(0)} KB</strong></div>
          <div className={styles.resultRow}><span>Compressed</span><strong>{(result.compressed/1024).toFixed(0)} KB</strong></div>
          {result.targetBytes && <div className={styles.resultRow}><span>Target</span><strong>{(result.targetBytes/1024).toFixed(0)} KB</strong></div>}
          <div className={styles.resultRow}><span>Mode</span><strong>{result.mode === 'visual' ? 'Visual' : 'Lossless'}</strong></div>
          <div className={`${styles.resultRow} ${styles.resultSaved}`}><span>Space saved</span><strong>{result.saved}%</strong></div>
          {!result.reachedTarget && <div className={styles.infoBox}>The target was too aggressive for this PDF. The downloaded file is the smallest acceptable result PDFZero could create.</div>}
        </div>
      )}
      <div className={styles.infoBox}>Target-size compression can convert pages into images to reach much smaller files. Text selection may be lost in visual mode.</div>
      <ActionBtn onClick={handleCompress} disabled={!file} loading={busy} icon={FileDown}>{targetKb ? `Compress below ${targetKb} KB` : 'Lossless Compress PDF'}</ActionBtn>
    </ToolShell>
  )
}

function RotateTool() {
  const [file, setFile]   = useState(null)
  const [mode, setMode]   = useState('all') // all | single
  const [page, setPage]   = useState(1)
  const [angle, setAngle] = useState(90)
  const [busy, setBusy]   = useState(false)

  const handleRotate = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Rotating...')
    try {
      const buf   = await file.arrayBuffer()
      const bytes = mode === 'all'
        ? await rotateAllPages(buf, angle)
        : await rotatePdf(buf, page, angle)
      downloadBytes(bytes, `rotated-${file.name}`)
      toast.success('Rotated PDF downloaded', { id: tid })
    } catch (e) { toast.error('Rotate failed: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Rotate PDF" desc="Rotate all pages or a specific page by 90°, 180°, or 270°.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.modeRow}>
        {[['all','All pages'],['single','Single page']].map(([v,l])=>(
          <button key={v} className={`${styles.modeBtn} ${mode===v?styles.modeBtnActive:''}`} onClick={()=>setMode(v)}>{l}</button>
        ))}
      </div>
      {mode === 'single' && (
        <div className={styles.rangeRow}>
          <label>Page number <input type="number" min={1} value={page} onChange={e=>setPage(+e.target.value)} className={styles.numInput}/></label>
        </div>
      )}
      <div className={styles.angleRow}>
        {[90,180,270].map(a => (
          <button key={a} className={`${styles.angleBtn} ${angle===a?styles.angleBtnActive:''}`} onClick={()=>setAngle(a)}>
            <RotateCw size={14}/> {a}°
          </button>
        ))}
      </div>
      <ActionBtn onClick={handleRotate} disabled={!file} loading={busy} icon={RotateCcw}>Rotate {angle}°</ActionBtn>
    </ToolShell>
  )
}

function WatermarkTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewSrc, setPreviewSrc] = useState('')
  const [previewDims, setPreviewDims] = useState({ width: 360, height: 480 })
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 })
  const [pageCount, setPageCount] = useState(0)

  const [watermarkType, setWatermarkType] = useState('text')
  const [text, setText] = useState('CONFIDENTIAL')
  const [fontFamily, setFontFamily] = useState('Helvetica')
  const [bold, setBold] = useState(true)
  const [italic, setItalic] = useState(false)
  const [color, setColor] = useState('#737373')
  const [size, setSize] = useState(52)
  const [opacity, setOpacity] = useState(15)
  const [rotation, setRotation] = useState(315)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [positionPreset, setPositionPreset] = useState('center')
  const [tiled, setTiled] = useState(false)
  const [pageMode, setPageMode] = useState('all')
  const [pageInput, setPageInput] = useState('')

  const [imageFile, setImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [imageDims, setImageDims] = useState({ width: 1, height: 1 })
  const [imageScale, setImageScale] = useState(28)

  useEffect(() => {
    if (!file) {
      setPreviewSrc('')
      setPageCount(0)
      return
    }

    let cancelled = false
    setPreviewLoading(true)

    ;(async () => {
      try {
        const buf = await file.arrayBuffer()
        const doc = await loadPdf(buf.slice(0))
        if (cancelled) return
        setPageCount(doc.numPages)
        const firstPage = await doc.getPage(1)
        const viewport = firstPage.getViewport({ scale: 1 })
        if (cancelled) return
        setPageSize({ width: viewport.width, height: viewport.height })
        const preview = await renderPage(1, 0.65)
        if (cancelled) return
        setPreviewSrc(preview.canvas.toDataURL('image/jpeg', 0.88))
        setPreviewDims({ width: preview.width, height: preview.height })
      } catch (e) {
        if (!cancelled) {
          setPreviewSrc('')
          toast.error('Preview failed: ' + e.message)
        }
      } finally {
        if (!cancelled) setPreviewLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [file])

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl('')
      setImageDims({ width: 1, height: 1 })
      return
    }

    const url = URL.createObjectURL(imageFile)
    setImagePreviewUrl(url)
    const img = new window.Image()
    img.onload = () => setImageDims({ width: img.width || 1, height: img.height || 1 })
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const previewScaleX = previewDims.width / pageSize.width
  const previewScaleY = previewDims.height / pageSize.height
  const previewFont = WATERMARK_FONT_OPTIONS.find((font) => font.id === fontFamily)?.css || WATERMARK_FONT_OPTIONS[0].css
  const previewFontSize = Math.max(size * previewScaleY, 12)
  const textMetrics = measurePreviewText(text || 'CONFIDENTIAL', previewFontSize, previewFont, bold, italic)
  const previewImageWidth = previewDims.width * (imageScale / 100)
  const previewImageHeight = previewImageWidth * (imageDims.height / imageDims.width)
  const previewMarkWidth = watermarkType === 'text' ? textMetrics.width : previewImageWidth
  const previewMarkHeight = watermarkType === 'text' ? textMetrics.height : previewImageHeight
  const previewItems = buildPreviewPlacements(previewDims.width, previewDims.height, previewMarkWidth, previewMarkHeight, {
    positionPreset,
    offsetX: offsetX * previewScaleX,
    offsetY: offsetY * previewScaleY,
    tiled,
  })

  const canApply = !!file && (
    (watermarkType === 'text' && text.trim()) ||
    (watermarkType === 'image' && imageFile)
  )

  const handleWatermark = async () => {
    if (!file) return

    let targetPages
    try {
      targetPages = parseWatermarkPages(pageMode, pageInput, pageCount)
    } catch (e) {
      toast.error(e.message)
      return
    }

    if (watermarkType === 'text' && !text.trim()) {
      toast.error('Enter watermark text')
      return
    }
    if (watermarkType === 'image' && !imageFile) {
      toast.error('Choose a PNG or JPG watermark image')
      return
    }

    setBusy(true)
    const tid = toast.loading('Applying watermark...')
    try {
      const buf = await file.arrayBuffer()
      const options = {
        type: watermarkType,
        text: text.trim(),
        fontFamily,
        bold,
        italic,
        color,
        fontSize: size,
        opacity: opacity / 100,
        rotation,
        offsetX,
        offsetY,
        positionPreset,
        tiled,
        targetPages,
        imageScale,
      }

      if (watermarkType === 'image' && imageFile) {
        options.imageBytes = await imageFile.arrayBuffer()
        options.imageType = imageFile.type
      }

      const bytes = await addWatermark(buf, options)
      downloadBytes(bytes, `watermarked-${file.name}`)
      toast.success(`Watermark applied to ${targetPages.length} page${targetPages.length === 1 ? '' : 's'}`, { id: tid })
    } catch (e) {
      toast.error('Failed: ' + e.message, { id: tid })
    }
    setBusy(false)
  }

  return (
    <ToolShell title="Add Watermark" desc="Text or image watermarks with live preview, placement control, page targeting, and tiled mode." wide>
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />

      <div className={styles.watermarkLayout}>
        <div className={styles.watermarkPanel}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Watermark Type</div>
            <div className={styles.modeRow}>
              <button className={`${styles.modeBtn} ${watermarkType === 'text' ? styles.modeBtnActive : ''}`} onClick={() => setWatermarkType('text')}>
                Text
              </button>
              <button className={`${styles.modeBtn} ${watermarkType === 'image' ? styles.modeBtnActive : ''}`} onClick={() => setWatermarkType('image')}>
                <ImageIcon size={13} /> Image
              </button>
            </div>

            {watermarkType === 'text' ? (
              <div className={styles.watermarkFieldGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Watermark text</label>
                  <input className={styles.formInput} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. CONFIDENTIAL" />
                </div>
                <div className={styles.dualGrid}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Font family</label>
                    <select className={styles.formInput} value={fontFamily} onChange={e => setFontFamily(e.target.value)}>
                      {WATERMARK_FONT_OPTIONS.map((font) => (
                        <option key={font.id} value={font.id}>{font.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Text color</label>
                    <div className={styles.colorInputRow}>
                      <input className={styles.colorInput} type="color" value={color} onChange={e => setColor(e.target.value)} />
                      <input className={styles.formInput} value={color} onChange={e => setColor(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className={styles.toggleRow}>
                  <button className={`${styles.toggleBtn} ${bold ? styles.toggleBtnActive : ''}`} onClick={() => setBold(v => !v)}>Bold</button>
                  <button className={`${styles.toggleBtn} ${italic ? styles.toggleBtnActive : ''}`} onClick={() => setItalic(v => !v)}>Italic</button>
                </div>
              </div>
            ) : (
              <div className={styles.watermarkFieldGrid}>
                {imageFile ? (
                  <div className={styles.fileChip}>
                    <ImageIcon size={15} />
                    <span className={styles.fileName}>{imageFile.name}</span>
                    <span className={styles.fileSize}>{(imageFile.size / 1024).toFixed(0)} KB</span>
                    <button className={styles.removeBtn} onClick={() => setImageFile(null)}><X size={13} /></button>
                  </div>
                ) : (
                  <label className={styles.imageDropArea}>
                    <input type="file" accept="image/png,image/jpeg" hidden onChange={e => setImageFile(e.target.files?.[0] || null)} />
                    <ImageIcon size={18} />
                    <span>Choose PNG or JPG watermark image</span>
                  </label>
                )}
              </div>
            )}
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Appearance</div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>
                {watermarkType === 'text' ? `Font size: ${size}pt` : `Image size: ${imageScale}% of page width`}
              </label>
              <input
                type="range"
                min={watermarkType === 'text' ? 18 : 10}
                max={watermarkType === 'text' ? 140 : 60}
                value={watermarkType === 'text' ? size : imageScale}
                onChange={e => watermarkType === 'text' ? setSize(+e.target.value) : setImageScale(+e.target.value)}
                className={styles.slider}
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Opacity: {opacity}%</label>
              <input type="range" min={5} max={80} value={opacity} onChange={e => setOpacity(+e.target.value)} className={styles.slider} />
            </div>
            <div className={styles.dualGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Rotation</label>
                <div className={styles.inlineControlRow}>
                  <input type="range" min={0} max={360} value={rotation} onChange={e => setRotation(+e.target.value)} className={styles.slider} />
                  <input className={styles.miniInput} type="number" min={0} max={360} value={rotation} onChange={e => setRotation(Math.max(0, Math.min(360, +e.target.value || 0)))} />
                </div>
              </div>
              <label className={styles.checkPill}>
                <input type="checkbox" checked={tiled} onChange={e => setTiled(e.target.checked)} />
                Repeated / tiled
              </label>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Placement</div>
            <div className={styles.presetGrid}>
              {WATERMARK_POSITION_PRESETS.map(([id, label]) => (
                <button key={id} className={`${styles.presetBtn} ${positionPreset === id ? styles.presetBtnActive : ''}`} onClick={() => setPositionPreset(id)}>
                  {label}
                </button>
              ))}
            </div>
            <div className={styles.dualGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>X offset</label>
                <input className={styles.formInput} type="number" value={offsetX} onChange={e => setOffsetX(+e.target.value || 0)} />
              </div>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Y offset</label>
                <input className={styles.formInput} type="number" value={offsetY} onChange={e => setOffsetY(+e.target.value || 0)} />
              </div>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Pages</div>
            <div className={styles.modeRow}>
              <button className={`${styles.modeBtn} ${pageMode === 'all' ? styles.modeBtnActive : ''}`} onClick={() => setPageMode('all')}>All pages</button>
              <button className={`${styles.modeBtn} ${pageMode === 'specific' ? styles.modeBtnActive : ''}`} onClick={() => setPageMode('specific')}>Specific pages</button>
              <button className={`${styles.modeBtn} ${pageMode === 'ranges' ? styles.modeBtnActive : ''}`} onClick={() => setPageMode('ranges')}>Page ranges</button>
            </div>
            {pageMode !== 'all' && (
              <div className={styles.formField}>
                <label className={styles.formLabel}>
                  {pageMode === 'specific' ? 'Pages like 1, 3, 7' : 'Ranges like 1-3, 6, 9-12'}
                </label>
                <input className={styles.formInput} value={pageInput} onChange={e => setPageInput(e.target.value)} placeholder={pageMode === 'specific' ? '1, 3, 7' : '1-3, 6, 9-12'} />
              </div>
            )}
            <div className={styles.infoBox}>Loaded PDF: {pageCount || 0} page{pageCount === 1 ? '' : 's'}.</div>
          </div>
        </div>

        <div className={`${styles.watermarkPanel} ${styles.previewPanel}`}>
          <div className={styles.sectionCard}>
            <div className={styles.sectionCardTitle}>Live Preview</div>
            <div className={styles.previewMeta}>Preview uses page 1 of your PDF and updates as you change settings.</div>
            {previewLoading ? (
              <div className={styles.previewEmpty}><Loader2 size={18} className={styles.spin} /> Rendering preview...</div>
            ) : previewSrc ? (
              <div className={styles.previewFrame} style={{ aspectRatio: `${previewDims.width} / ${previewDims.height}` }}>
                <img src={previewSrc} alt="Watermark preview" className={styles.previewImage} />
                <div className={styles.previewOverlay}>
                  {previewItems.map((item, index) => (
                    watermarkType === 'text' ? (
                      <div
                        key={`${item.x}-${item.y}-${index}`}
                        className={styles.previewTextMark}
                        style={{
                          left: item.x,
                          top: item.y,
                          fontSize: previewFontSize,
                          fontFamily: previewFont,
                          fontWeight: bold ? 700 : 400,
                          fontStyle: italic ? 'italic' : 'normal',
                          color,
                          opacity: opacity / 100,
                          transform: `rotate(${rotation}deg)`,
                        }}
                      >
                        {text || 'CONFIDENTIAL'}
                      </div>
                    ) : imagePreviewUrl ? (
                      <img
                        key={`${item.x}-${item.y}-${index}`}
                        src={imagePreviewUrl}
                        alt=""
                        className={styles.previewImageMark}
                        style={{
                          left: item.x,
                          top: item.y,
                          width: previewImageWidth,
                          height: previewImageHeight,
                          opacity: opacity / 100,
                          transform: `rotate(${rotation}deg)`,
                        }}
                      />
                    ) : null
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.previewEmpty}>Add a PDF to generate the preview.</div>
            )}
          </div>
          <ActionBtn onClick={handleWatermark} disabled={!canApply} loading={busy} icon={Droplets}>
            Apply Watermark
          </ActionBtn>
        </div>
      </div>
    </ToolShell>
  )
}

function ExtractTool() {
  const [file, setFile]   = useState(null)
  const [pages, setPages] = useState('')
  const [busy, setBusy]   = useState(false)

  const handleExtract = async () => {
    if (!file || !pages.trim()) return
    setBusy(true)
    const tid = toast.loading('Extracting...')
    try {
      const buf = await file.arrayBuffer()
      // Parse "1,3,5-8" style input
      const nums = []
      for (const part of pages.split(',')) {
        const t = part.trim()
        if (t.includes('-')) {
          const [a,b] = t.split('-').map(Number)
          for (let i=a; i<=b; i++) nums.push(i)
        } else {
          const n = Number(t)
          if (!isNaN(n)) nums.push(n)
        }
      }
      const unique = [...new Set(nums)].sort((a,b)=>a-b)
      const bytes  = await extractPages(buf, unique)
      downloadBytes(bytes, `extracted-pages-${file.name}`)
      toast.success(`Extracted ${unique.length} pages`, { id: tid })
    } catch (e) { toast.error('Extract failed: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Extract Pages" desc="Pull specific pages out of a PDF into a new file.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.formField}>
        <label className={styles.formLabel}>Pages to extract (e.g. 1, 3, 5-8)</label>
        <input className={styles.formInput} value={pages} onChange={e=>setPages(e.target.value)} placeholder="1, 3, 5-8, 12" />
      </div>
      <ActionBtn onClick={handleExtract} disabled={!file || !pages.trim()} loading={busy} icon={FileSearch}>Extract Pages</ActionBtn>
    </ToolShell>
  )
}

function ReorderTool() {
  const [file, setFile]     = useState(null)
  const [thumbs, setThumbs] = useState([])
  const [order, setOrder]   = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]     = useState(false)
  const dragIdx = React.useRef(null)

  const onFile = async (f) => {
    setFile(f)
    setLoading(true)
    try {
      const buf = await f.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const total = doc.numPages
      const pages = Array.from({length: total}, (_,i) => i+1)
      setOrder(pages)
      const ts = []
      for (let i=1; i<=Math.min(total,20); i++) {
        const dataUrl = await renderThumbnail(i)
        ts.push({ page: i, dataUrl })
      }
      setThumbs(ts)
    } catch (e) { toast.error('Failed to load: ' + e.message) }
    setLoading(false)
  }

  const handleDragStart = (i) => { dragIdx.current = i }
  const handleDragOver  = (e) => e.preventDefault()
  const handleDrop      = (i) => {
    if (dragIdx.current === null || dragIdx.current === i) return
    const newOrder = [...order]
    const [moved]  = newOrder.splice(dragIdx.current, 1)
    newOrder.splice(i, 0, moved)
    setOrder(newOrder)
    const newThumbs = [...thumbs]
    const [mt] = newThumbs.splice(dragIdx.current, 1)
    newThumbs.splice(i, 0, mt)
    setThumbs(newThumbs)
    dragIdx.current = null
  }

  const handleSave = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Reordering pages...')
    try {
      const buf   = await file.arrayBuffer()
      const bytes = await reorderPages(buf, order)
      downloadBytes(bytes, `reordered-${file.name}`)
      toast.success('Done!', { id: tid })
    } catch (e) { toast.error('Failed: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Reorder Pages" desc="Drag and drop pages into the order you want, then download.">
      {!file
        ? <FileDropper file={null} onFile={onFile} onClear={() => {}} />
        : (
          <>
            <div className={styles.fileChip}>
              <FileText size={14}/>
              <span className={styles.fileName}>{file.name}</span>
              <button className={styles.removeBtn} onClick={() => { setFile(null); setThumbs([]); setOrder([]) }}><X size={12}/></button>
            </div>
            {loading
              ? <div className={styles.loadingRow}><Loader2 size={18} className={styles.spin}/> Loading pages...</div>
              : (
                <div className={styles.reorderGrid}>
                  {thumbs.map((t, i) => (
                    <div
                      key={t.page}
                      className={styles.reorderCard}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(i)}
                    >
                      <div className={styles.reorderHandle}><GripVertical size={12}/></div>
                      <img src={t.dataUrl} alt={`Page ${t.page}`} className={styles.reorderThumb} />
                      <span className={styles.reorderNum}>{i+1}</span>
                    </div>
                  ))}
                </div>
              )
            }
            <ActionBtn onClick={handleSave} disabled={!file || loading} loading={busy} icon={Check}>Save Reordered PDF</ActionBtn>
          </>
        )
      }
    </ToolShell>
  )
}

function OcrTool() {
  const [file, setFile]     = useState(null)
  const [busy, setBusy]     = useState(false)
  const [progress, setProgress] = useState(0)
  const navigate = useNavigate()

  const handleOcr = async () => {
    if (!file) return
    setBusy(true)
    setProgress(0)
    const tid = toast.loading('Initialising OCR engine...')
    try {
      const { renderPage } = await import('../lib/pdfRenderer.js')
      const { ocrCanvas }  = await import('../lib/ocrEngine.js')
      const buf = await file.arrayBuffer()
      const doc = await loadPdf(buf.slice(0))
      const total = doc.numPages
      const allText = []

      for (let p = 1; p <= total; p++) {
        toast.loading(`OCR page ${p}/${total}...`, { id: tid })
        const { canvas } = await renderPage(p, 1)
        const words = await ocrCanvas(canvas, pct => setProgress(Math.round((p-1)/total*100 + pct/total)))
        if (words.length) allText.push(`--- Page ${p} ---\n` + words.map(w=>w.str).join(' '))
      }

      // Download as searchable text file
      const blob = new Blob([allText.join('\n\n')], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = file.name.replace('.pdf','') + '-ocr.txt'; a.click()
      URL.revokeObjectURL(url)
      toast.success(`OCR complete — ${total} pages`, { id: tid })
    } catch (e) { toast.error('OCR failed: ' + e.message, { id: tid }) }
    setBusy(false)
    setProgress(0)
  }

  return (
    <ToolShell title="OCR Scanner" desc="Extract text from scanned or image-based PDFs using Tesseract.js — runs 100% offline.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      {busy && (
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          <span>{progress}%</span>
        </div>
      )}
      <ActionBtn onClick={handleOcr} disabled={!file} loading={busy} icon={ScanLine}>
        {busy ? `Scanning... ${progress}%` : 'Run OCR & Download Text'}
      </ActionBtn>
    </ToolShell>
  )
}

function ProtectTool() {
  const [file, setFile] = useState(null)
  const [pw, setPw]     = useState('')
  const [ownerPw, setOwnerPw] = useState('')
  const [algorithm, setAlgorithm] = useState('AES-256')
  const [allowPrinting, setAllowPrinting] = useState(true)
  const [allowCopying, setAllowCopying] = useState(false)
  const [allowModifying, setAllowModifying] = useState(false)
  const [busy, setBusy] = useState(false)

  const handleProtect = async () => {
    if (!file || !pw) return
    setBusy(true)
    const tid = toast.loading('Encrypting...')
    try {
      const buf = await file.arrayBuffer()
      const bytes = await protectPdf(buf, pw, {
        ownerPassword: ownerPw || pw,
        algorithm,
        allowPrinting,
        allowCopying,
        allowModifying,
      })
      downloadBytes(bytes, `protected-${file.name}`)
      toast.success('Password-protected PDF downloaded', { id: tid })
    } catch (e) { toast.error('Failed: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Protect PDF" desc="Add a real open-password lock with AES-256 encryption directly in your browser.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Open password</label>
          <input className={styles.formInput} type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="Required to open PDF" />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel}>Owner password</label>
          <input className={styles.formInput} type="password" value={ownerPw} onChange={e=>setOwnerPw(e.target.value)} placeholder="Optional admin password" />
        </div>
        <div className={styles.modeRow}>
          {['AES-256', 'RC4'].map(id => (
            <button key={id} className={`${styles.modeBtn} ${algorithm===id?styles.modeBtnActive:''}`} onClick={()=>setAlgorithm(id)}>{id}</button>
          ))}
        </div>
        <div className={styles.checkGrid}>
          <label><input type="checkbox" checked={allowPrinting} onChange={e=>setAllowPrinting(e.target.checked)} /> Allow printing</label>
          <label><input type="checkbox" checked={allowCopying} onChange={e=>setAllowCopying(e.target.checked)} /> Allow copying</label>
          <label><input type="checkbox" checked={allowModifying} onChange={e=>setAllowModifying(e.target.checked)} /> Allow editing</label>
        </div>
      </div>
      <div className={styles.infoBox}>
        Modern readers support AES-256. Use RC4 only if you need compatibility with older PDF readers.
      </div>
      <ActionBtn onClick={handleProtect} disabled={!file || !pw} loading={busy} icon={Lock}>Protect PDF</ActionBtn>
    </ToolShell>
  )
}
function UnlockTool() {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  const handleUnlock = async () => {
    if (!file) return
    setBusy(true)
    const tid = toast.loading('Removing restrictions...')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const buf   = await file.arrayBuffer()
      const doc   = await PDFDocument.load(buf, { ignoreEncryption: true })
      const bytes = await doc.save()
      downloadBytes(bytes, `unlocked-${file.name}`)
      toast.success('PDF saved without restrictions', { id: tid })
    } catch (e) { toast.error('Failed: ' + e.message, { id: tid }) }
    setBusy(false)
  }

  return (
    <ToolShell title="Unlock PDF" desc="Remove copy/print restrictions from a PDF you own.">
      <FileDropper file={file} onFile={setFile} onClear={() => setFile(null)} />
      <div className={styles.infoBox}>
        ℹ️ This removes PDF user restrictions (copy, print). It does not bypass strong AES-256 owner passwords.
      </div>
      <ActionBtn onClick={handleUnlock} disabled={!file} loading={busy} icon={Unlock}>Remove Restrictions</ActionBtn>
    </ToolShell>
  )
}

function RedactTool() {
  const navigate = useNavigate()
  return (
    <ToolShell title="Redact PDF" desc="Permanently black out sensitive content in the PDF editor.">
      <div className={styles.infoBox} style={{ borderColor: 'rgba(232,69,69,0.3)', background: 'rgba(232,69,69,0.05)' }}>
        🎯 Redaction works in the <strong>PDF Editor</strong>. Open your PDF, select the <strong>Redact tool</strong> in the toolbar, then drag over any content to permanently black it out.
      </div>
      <ActionBtn onClick={() => navigate('/editor')} icon={Edit3}>Open PDF Editor</ActionBtn>
    </ToolShell>
  )
}

function EditTool() {
  const navigate = useNavigate()
  return (
    <ToolShell title="Edit PDF" desc="Full in-browser PDF editor — edit text, add annotations, sign, and more.">
      <ActionBtn onClick={() => navigate('/editor')} icon={Edit3}>Open PDF Editor →</ActionBtn>
    </ToolShell>
  )
}

/* ─────────────────── tool registry ─────────────────── */
const TOOL_DEFS = [
  { id:'edit',      icon:Edit3,       label:'Edit PDF',       color:'#e84545', category:'Edit',     desc:'Edit text, images, annotate.' },
  { id:'merge',     icon:Merge,       label:'Merge PDFs',     color:'#3b82f6', category:'Organize', desc:'Combine multiple PDFs into one.' },
  { id:'split',     icon:Scissors,    label:'Split PDF',      color:'#e84545', category:'Organize', desc:'Split by range or every N pages.' },
  { id:'extract',   icon:FileSearch,  label:'Extract Pages',  color:'#f59e0b', category:'Organize', desc:'Pull specific pages into a new file.' },
  { id:'reorder',   icon:Layers,      label:'Reorder Pages',  color:'#8b5cf6', category:'Organize', desc:'Drag-and-drop page reordering.' },
  { id:'rotate',    icon:RotateCcw,   label:'Rotate PDF',     color:'#8b5cf6', category:'Organize', desc:'Rotate pages 90°, 180°, or 270°.' },
  { id:'compress',  icon:FileDown,    label:'Compress PDF',   color:'#f59e0b', category:'Optimize', desc:'Target-size visual compression.' },
  { id:'ocr',       icon:ScanLine,    label:'OCR Scanner',    color:'#10b981', category:'Convert',  desc:'Extract text from scanned PDFs.' },
  { id:'watermark', icon:Droplets,    label:'Add Watermark',  color:'#06b6d4', category:'Secure',   desc:'Text or image watermarks with preview and page targeting.' },
  { id:'protect',   icon:Lock,        label:'Protect PDF',    color:'#e84545', category:'Secure',   desc:'Add password encryption.' },
  { id:'unlock',    icon:Unlock,      label:'Unlock PDF',     color:'#10b981', category:'Secure',   desc:'Remove copy/print restrictions.' },
  { id:'redact',    icon:EyeOff,      label:'Redact PDF',     color:'#1a1a1a', category:'Secure',   desc:'Black out sensitive content.' },
]

const TOOL_COMPONENTS = {
  edit: EditTool, merge: MergeTool, split: SplitTool, extract: ExtractTool,
  reorder: ReorderTool, rotate: RotateTool, compress: CompressTool,
  ocr: OcrTool, watermark: WatermarkTool, protect: ProtectTool,
  unlock: UnlockTool, redact: RedactTool,
}

const CATEGORIES = ['All','Organize','Optimize','Convert','Secure','Edit']

export default function Tools() {
  const [activeCat,  setActiveCat]  = useState('All')
  const [activeTool, setActiveTool] = useState(null)

  const filtered = activeCat === 'All' ? TOOL_DEFS : TOOL_DEFS.filter(t => t.category === activeCat)
  const ToolUI   = activeTool ? TOOL_COMPONENTS[activeTool] : null

  return (
    <div className={styles.page}>
      <Navbar variant="app" />
      <div className={styles.layout}>
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <span className={styles.sidebarTitle}>PDF Tools</span>
            <span className={styles.toolCount}>{TOOL_DEFS.length}</span>
          </div>
          <div className={styles.cats}>
            {CATEGORIES.map(c => (
              <button key={c} className={`${styles.catBtn} ${activeCat===c?styles.catActive:''}`} onClick={()=>setActiveCat(c)}>{c}</button>
            ))}
          </div>
          <div className={styles.toolList}>
            {filtered.map(tool => {
              const Icon = tool.icon
              return (
                <button key={tool.id} className={`${styles.toolListItem} ${activeTool===tool.id?styles.toolListActive:''}`} onClick={()=>setActiveTool(tool.id)}>
                  <div className={styles.toolListIcon} style={{ background: tool.color+'18' }}>
                    <Icon size={15} style={{ color: tool.color }} />
                  </div>
                  <div className={styles.toolListInfo}>
                    <span className={styles.toolListName}>{tool.label}</span>
                    <span className={styles.toolListCat}>{tool.category}</span>
                  </div>
                  <ChevronRight size={12} className={styles.toolListArrow}/>
                </button>
              )
            })}
          </div>
        </div>

        <div className={styles.content}>
          {ToolUI
            ? <>
                <button className={styles.backBtn} onClick={() => setActiveTool(null)}>
                  <ArrowLeft size={14}/> All tools
                </button>
                <ToolUI />
              </>
            : (
              <div className={styles.toolGrid}>
                <div className={styles.toolGridHeader}>
                  <h1 className={styles.toolGridTitle}>All PDF Tools</h1>
                  <p className={styles.toolGridSub}>Every tool is free, unlimited, and runs 100% in your browser.</p>
                </div>
                <div className={styles.cards}>
                  {filtered.map(tool => {
                    const Icon = tool.icon
                    return (
                      <div key={tool.id} className={styles.toolCard} onClick={() => setActiveTool(tool.id)}>
                        <div className={styles.toolCardIcon} style={{ background: tool.color+'18' }}>
                          <Icon size={22} style={{ color: tool.color }} />
                        </div>
                        <div className={styles.toolCardName}>{tool.label}</div>
                        <div className={styles.toolCardDesc}>{tool.desc}</div>
                        <span className={styles.freeBadge}>Free</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}
