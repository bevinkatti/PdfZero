import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import * as pdfjsLib from 'pdfjs-dist'
import { AlertCircle, ArrowDownToLine, Check, ChevronLeft, ChevronRight, FileText, Grid2X2, Info, Loader2, Minus, Plus, RotateCcw, Share2, Upload, X } from 'lucide-react'
import Navbar from '../components/layout/Navbar.jsx'
import { calculateLayout, exportMultiPagePdf, getCellRect, LAYOUT_PRESETS, MM_TO_PT } from '../lib/multiPageLayout.js'
import styles from './MultiPageLayout.module.css'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
const DEFAULTS = { preset: '4', paper: 'A4', orientation: 'portrait', marginMm: 0, gapXmm: 0, gapYmm: 0, borders: false, labels: false }
const readableSize = (bytes) => bytes < 1024 * 1024 ? (bytes / 1024).toFixed(0) + ' KB' : (bytes / (1024 * 1024)).toFixed(1) + ' MB'

function describePdfError(error) {
  const message = ((error && error.name) || '') + ' ' + ((error && error.message) || '')
  if (/password|encrypt/i.test(message)) return 'This PDF is password-protected. Remove its password and try again.'
  if (/worker/i.test(message)) return 'The PDF reader could not start. Refresh the page and try again.'
  if (/memory|allocation/i.test(message)) return 'This PDF is too large for the available browser memory.'
  return 'This file could not be read as a supported PDF. Check the file and try again.'
}

function PageCanvas({ pdf, pageNumber, onError }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    let task
    let disposed = false
    let frame
    const canvas = canvasRef.current
    if (!pdf || !canvas) return undefined
    const render = async () => {
      try {
        if (task) task.cancel()
        const page = await pdf.getPage(pageNumber)
        if (disposed) return
        const parent = canvas.parentElement
        const width = Math.max(1, parent.getBoundingClientRect().width)
        const baseViewport = page.getViewport({ scale: 1 })
        const height = Math.max(1, parent.getBoundingClientRect().height)
        const scale = Math.min(width / baseViewport.width, height / baseViewport.height)
        const viewport = page.getViewport({ scale })
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
        canvas.width = Math.max(1, Math.round(viewport.width * dpr))
        canvas.height = Math.max(1, Math.round(viewport.height * dpr))
        const context = canvas.getContext('2d', { alpha: false })
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        task = page.render({ canvasContext: context, viewport, background: '#ffffff' })
        await task.promise
      } catch (error) {
        if (!disposed && error.name !== 'RenderingCancelledException') onError('A source page could not be rendered in the preview.')
      }
    }
    frame = requestAnimationFrame(render)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { frame = requestAnimationFrame(render) }) : null
    observer && observer.observe(canvas.parentElement)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer && observer.disconnect()
      task && task.cancel()
      canvas.width = 1
      canvas.height = 1
    }
  }, [pdf, pageNumber, onError])
  return <canvas ref={canvasRef} className={styles.pageCanvas} aria-label={'Preview of source page ' + pageNumber} />
}

function RangeSetting({ id, label, value, min, max, onChange }) {
  return <div className={styles.rangeSetting}>
    <div className={styles.settingLabelRow}><label htmlFor={id + '-number'}>{label}</label><div className={styles.numberControl}>
      <input id={id + '-number'} type="number" min={min} max={max} step="0.5" value={value} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} inputMode="decimal" /><span>mm</span>
    </div></div>
    <input aria-label={label + ' slider'} type="range" min={min} max={max} step="0.5" value={value === '' ? min : value} onChange={(event) => onChange(Number(event.target.value))} />
    <div className={styles.rangeEnds}><span>{min} mm</span><span>{max} mm</span></div>
  </div>
}

export default function MultiPageLayout() {
  const [settings, setSettings] = useState(DEFAULTS)
  const [file, setFile] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [fileError, setFileError] = useState('')
  const [error, setError] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [busyLoading, setBusyLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [output, setOutput] = useState(null)
  const generation = useRef(0)
  const oldOutput = useRef(null)
  const pdfRef = useRef(null)
  const busyLoadingRef = useRef(false)

  useEffect(() => {
    const title = document.title
    document.title = 'Multi-Page Layout Studio · PDFZero'
    return () => { document.title = title }
  }, [])
  useEffect(() => () => {
    generation.current += 1
    if (pdfRef.current) pdfRef.current.destroy()
    if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
  }, [])

  const loadFile = useCallback(async (candidate) => {
    if (!candidate || busyLoadingRef.current) return
    if (file && !window.confirm('Replace the current PDF? The current file will be removed, but your layout settings will stay.')) return
    busyLoadingRef.current = true
    setBusyLoading(true)
    setFileError('')
    setError('')
    setPreviewError('')
    setSheetIndex(0)
    const request = ++generation.current
    let loadingTask
    try {
      if (candidate.type !== 'application/pdf' && !candidate.name.toLowerCase().endsWith('.pdf')) throw new Error('Choose a PDF file to continue.')
      const bytes = await candidate.arrayBuffer()
      loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) })
      const loaded = await loadingTask.promise
      if (request !== generation.current) { await loaded.destroy(); return }
      const first = await loaded.getPage(1)
      const size = first.getViewport({ scale: 1 })
      if (pdfRef.current) pdfRef.current.destroy()
      pdfRef.current = loaded
      setPdf(loaded)
      setPageCount(loaded.numPages)
      setFile({ source: candidate, width: size.width, height: size.height })
      if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
      oldOutput.current = null
      setOutput(null)
    } catch (failure) {
      if (request === generation.current) {
        setFileError(failure.message === 'Choose a PDF file to continue.' ? failure.message : describePdfError(failure))
        if (loadingTask) await loadingTask.destroy()
      }
    } finally {
      if (request === generation.current) {
        busyLoadingRef.current = false
        setBusyLoading(false)
      }
    }
  }, [file])
  const onDrop = useCallback((accepted, rejected) => {
    if (busyLoadingRef.current) return
    if (rejected.length) setFileError('Only PDF files are supported. Please choose a .pdf file.')
    if (accepted[0]) loadFile(accepted[0])
  }, [loadFile])
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    accept: { 'application/pdf': ['.pdf'] }, maxFiles: 1, multiple: false,
    noClick: true, noKeyboard: true, onDrop,
  })
  const layout = useMemo(() => {
    if (!file || !pageCount) return null
    try { return { value: calculateLayout({ ...settings, pageCount, originalSize: { width: file.width, height: file.height } }), error: '' } }
    catch (failure) { return { value: null, error: failure.message } }
  }, [file, pageCount, settings])
  const count = layout && layout.value ? layout.value.totalSheets : 0
  const startPage = layout && layout.value ? sheetIndex * layout.value.pagesPerSheet + 1 : 1
  const endPage = Math.min(startPage + ((layout && layout.value && layout.value.pagesPerSheet) || 1) - 1, pageCount)
  const update = (key, value) => setSettings((current) => ({ ...current, [key]: value }))
  const reportPreviewError = useCallback((message) => setPreviewError(message), [])
  let supportsFileShare = false
  try {
    supportsFileShare = typeof File !== 'undefined' && typeof navigator !== 'undefined'
      && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([], 'layout.pdf', { type: 'application/pdf' })] })
  } catch { supportsFileShare = false }
  useEffect(() => {
    if (count && sheetIndex >= count) setSheetIndex(count - 1)
  }, [count, sheetIndex])
  const removeFile = () => {
    generation.current += 1
    busyLoadingRef.current = false
    if (pdfRef.current) pdfRef.current.destroy()
    pdfRef.current = null
    setPdf(null); setFile(null); setPageCount(0); setFileError(''); setError(''); setSheetIndex(0)
    if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
    oldOutput.current = null; setOutput(null)
  }
  const exportPdf = async () => {
    if (!file || !layout || !layout.value || busy) return
    setBusy(true); setError(''); setOutput(null)
    if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
    oldOutput.current = null
    try {
      const result = await exportMultiPagePdf(await file.source.arrayBuffer(), { ...settings, pageCount })
      const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }))
      if (oldOutput.current) URL.revokeObjectURL(oldOutput.current)
      oldOutput.current = url
      setOutput({ url, filename: file.source.name.replace(/\.pdf$/i, '') + '-multi-page.pdf', pages: result.layout.totalSheets })
    } catch (failure) {
      setError(failure.message || 'The PDF could not be exported. Your source file and settings are unchanged.')
    } finally { setBusy(false) }
  }
  const sharePdf = async () => {
    if (!output || !navigator.canShare || !navigator.share) return
    try {
      const blob = await (await fetch(output.url)).blob()
      const outputFile = new File([blob], output.filename, { type: 'application/pdf' })
      if (navigator.canShare({ files: [outputFile] })) await navigator.share({ files: [outputFile], title: output.filename })
    } catch (failure) {
      if (failure.name !== 'AbortError') setError('Sharing is unavailable. Use Open PDF to save or share the generated file.')
    }
  }
  const dimensions = layout && layout.value
  return <div className={styles.page}>
    <Navbar variant="app" />
    <main className={styles.main}>
      <header className={styles.pageHeader}>
        <div className={styles.eyebrow}><Grid2X2 size={14} /> PDF TOOL · PAGE LAYOUT</div>
        <h1>Multi-Page Layout Studio</h1>
        <p>Arrange pages from an existing PDF into a print-ready sheet layout.</p>
      </header>
      <div className={styles.workspace}>
        <input {...getInputProps({ 'aria-label': 'Choose a PDF file' })} />
        <section className={styles.previewPanel} aria-label="Document preview">
          <div className={styles.previewTopbar}>
            <div><span className={styles.previewHeading}>Sheet preview</span><span className={styles.previewMeta}>{file ? 'Pages ' + startPage + '–' + endPage + ' of ' + pageCount : 'Live layout preview'}</span></div>
            <div className={styles.previewActions}>
              <button type="button" aria-label="Zoom out" onClick={() => setZoom((v) => Math.max(70, v - 10))} disabled={zoom <= 70}><Minus size={15} /></button>
              <span aria-live="polite">{zoom}%</span>
              <button type="button" aria-label="Zoom in" onClick={() => setZoom((v) => Math.min(130, v + 10))} disabled={zoom >= 130}><Plus size={15} /></button>
            </div>
          </div>
          <div {...getRootProps({ className: styles.previewStage + (!file ? ' ' + styles.previewStageEmpty : '') + (isDragActive ? ' ' + styles.previewDragActive : '') })}>
            {busyLoading && <div className={styles.previewState}><Loader2 className={styles.spin} size={26} /><strong>Reading your PDF…</strong><span>Checking its pages in this browser</span></div>}
            {!busyLoading && !file && <div className={styles.previewDropzone}>
              <div className={styles.previewUploadIcon}><Upload size={28} /></div>
              <strong>{isDragActive ? 'Drop your PDF here' : 'Drop your PDF here'}</strong>
              <span>Arrange multiple PDF pages on a single sheet with your preferred layout.</span>
              <button type="button" className={styles.choosePdfBtn} disabled={busyLoading} onClick={(event) => { event.stopPropagation(); open() }}><Upload size={15} /> Choose PDF</button>
              <div className={styles.previewLocalNote}><AlertCircle size={13} /> Your PDF is processed locally and never uploaded.</div>
              {fileError && <p className={styles.previewFileError} role="alert">{fileError}</p>}
            </div>}
            {!busyLoading && file && dimensions && <div className={styles.sheetWrap} style={{ maxWidth: (760 * zoom / 100) + 'px', aspectRatio: dimensions.width + ' / ' + dimensions.height }} aria-label={'Output sheet ' + (sheetIndex + 1)}>
              <div className={styles.sheetPaper}>{Array.from({ length: Math.min(dimensions.pagesPerSheet, Math.max(0, pageCount - sheetIndex * dimensions.pagesPerSheet)) }, (_, slot) => {
                const number = sheetIndex * dimensions.pagesPerSheet + slot + 1
                const cell = getCellRect(dimensions, slot)
                return <div key={number} className={styles.pageCell + (settings.borders ? ' ' + styles.cellBorder : '')} style={{ left: (cell.x / dimensions.width * 100) + '%', bottom: (cell.y / dimensions.height * 100) + '%', width: (cell.width / dimensions.width * 100) + '%', height: (cell.height / dimensions.height * 100) + '%' }}>
                  <PageCanvas pdf={pdf} pageNumber={number} onError={reportPreviewError} />
                  {settings.labels && <span className={styles.pageLabel}>Page {number}</span>}
                </div>
              })}</div>
            </div>}
            {!busyLoading && file && layout && layout.error && <div className={styles.previewState} role="alert"><strong>Layout needs adjustment</strong><span>{layout.error}</span></div>}
            {previewError && <div className={styles.previewFallback} role="status">{previewError} The export may still work.</div>}
            {isDragActive && file && <div className={styles.dropOverlay}>Drop your PDF to replace the current file</div>}
          </div>
          <div className={styles.previewFooter}>
            <div className={styles.sheetNav}>
              <button type="button" aria-label="Previous output sheet" onClick={() => setSheetIndex((v) => Math.max(0, v - 1))} disabled={!file || sheetIndex === 0}><ChevronLeft size={17} /></button>
              <span>Sheet <strong>{file ? Math.min(sheetIndex + 1, Math.max(count, 1)) : '—'}</strong> of {file ? count : '—'}</span>
              <button type="button" aria-label="Next output sheet" onClick={() => setSheetIndex((v) => Math.min(count - 1, v + 1))} disabled={!file || sheetIndex >= count - 1}><ChevronRight size={17} /></button>
            </div>
            <span className={styles.sheetDimensions}>{dimensions ? Math.round(dimensions.width / MM_TO_PT) + ' × ' + Math.round(dimensions.height / MM_TO_PT) + ' mm' : 'A4 · Portrait'}</span>
          </div>
        </section>
        <aside className={styles.settingsPanel}>
          <div className={styles.panelHeading}><div><h2>Layout settings</h2><p>Fine-tune your output sheet</p></div><button type="button" className={styles.resetBtn} onClick={() => setSettings(DEFAULTS)}><RotateCcw size={13} /> Reset</button></div>
          <section className={styles.uploadSection} aria-labelledby="source-pdf-heading">
            <div className={styles.sectionTitle}><h3 id="source-pdf-heading">Source PDF</h3>{file && <span className={styles.readyTag}><i /> Ready</span>}</div>
            {!file && <div className={styles.sourceEmpty}>
              <span className={styles.sourceUploadIcon}><Upload size={16} /></span>
              <span className={styles.sourceInstruction}>Select a PDF for your sheet preview</span>
              <button type="button" className={styles.sourceUploadBtn} disabled={busyLoading} onClick={open}><Upload size={14} /> Upload PDF</button>
              {fileError && <p className={styles.errorMessage} role="alert">{fileError}</p>}
            </div>}
            {file && <div className={styles.fileCard}>
              <div className={styles.fileIcon}><FileText size={18} /></div>
              <div className={styles.fileDetails}><strong title={file.source.name}>{file.source.name}</strong><span>{readableSize(file.source.size)} <i /> {pageCount} {pageCount === 1 ? 'page' : 'pages'}</span></div>
              <button type="button" className={styles.changePdfBtn} disabled={busyLoading} onClick={open}><Upload size={14} /> Change PDF</button>
              <button type="button" className={styles.iconBtn} aria-label="Remove PDF" disabled={busyLoading} onClick={removeFile}><X size={15} /></button>
            </div>}
            {file && fileError && <p className={styles.errorMessage} role="alert">{fileError}</p>}
            <p className={styles.privacyNote}><Info size={13} /> Processed locally on this device.</p>
          </section>
          <section className={styles.settingSection}><h3>Pages per sheet</h3><div className={styles.presetGrid}>{LAYOUT_PRESETS.map((preset) => {
            const shape = preset[settings.orientation]
            return <button type="button" key={preset.id} className={styles.presetCard + (settings.preset === preset.id ? ' ' + styles.presetSelected : '')} onClick={() => update('preset', preset.id)} aria-pressed={settings.preset === preset.id}>
              <span className={styles.miniGrid} style={{ '--columns': shape[0], '--rows': shape[1] }}>{Array.from({ length: preset.count }, (_, index) => <i key={index} />)}</span>
              <span className={styles.presetName}>{preset.label}</span><span className={styles.presetShape}>{shape[0]} × {shape[1]}</span>
              {settings.preset === preset.id && <Check size={15} className={styles.presetCheck} />}
            </button>
          })}</div></section>
          <section className={styles.settingSection}>
            <h3>Paper</h3><div className={styles.segmented} role="group" aria-label="Output paper">{[['A4', 'A4'], ['A3', 'A3'], ['Letter', 'US Letter'], ['Original', 'Original']].map(([value, label]) => <button type="button" key={value} className={settings.paper === value ? styles.segmentActive : ''} aria-pressed={settings.paper === value} onClick={() => update('paper', value)}>{label}</button>)}</div>
            {settings.paper === 'Original' && <div className={styles.infoNote}><Info size={14} /> Uses the first source page’s size for every sheet when pages have mixed dimensions.</div>}
            <div className={styles.orientationRow}><span>Orientation</span><div className={styles.segmented} role="group" aria-label="Sheet orientation">{[['portrait', 'Portrait'], ['landscape', 'Landscape']].map(([value, label]) => <button type="button" key={value} className={settings.orientation === value ? styles.segmentActive : ''} aria-pressed={settings.orientation === value} onClick={() => update('orientation', value)}>{label}</button>)}</div></div>
          </section>
          <section className={styles.settingSection}><div className={styles.sectionTitle}><h3>Spacing</h3><button type="button" className={styles.inlineReset} onClick={() => setSettings((s) => ({ ...s, marginMm: 0, gapXmm: 0, gapYmm: 0 }))}>Default</button></div>
            <RangeSetting id="margin" label="Outer margins" value={settings.marginMm} min={0} max={30} onChange={(v) => update('marginMm', v)} />
            <div className={styles.gapFields}><RangeSetting id="gap-x" label="Horizontal gap" value={settings.gapXmm} min={0} max={15} onChange={(v) => update('gapXmm', v)} /><RangeSetting id="gap-y" label="Vertical gap" value={settings.gapYmm} min={0} max={15} onChange={(v) => update('gapYmm', v)} /></div>
            {layout && layout.error && <p className={styles.validationError} role="alert">{layout.error}</p>}
          </section>
          <section className={styles.settingSection}><h3>Page details</h3>
            <label className={styles.checkRow}><input type="checkbox" checked={settings.borders} onChange={(event) => update('borders', event.target.checked)} /><span className={styles.customCheck}><Check size={12} /></span><span><strong>Cell borders</strong><small>Outline each page position</small></span></label>
            <label className={styles.checkRow}><input type="checkbox" checked={settings.labels} onChange={(event) => update('labels', event.target.checked)} /><span className={styles.customCheck}><Check size={12} /></span><span><strong>Page labels</strong><small>Show original page numbers</small></span></label>
          </section>
          <p className={styles.limitationNote}>Page content stays vector. Interactive fields, comments, links, and digital signatures are not carried into the new PDF.</p>
          <button type="button" className={styles.exportBtn} onClick={exportPdf} disabled={!file || !layout || !layout.value || busy || busyLoading}>{busy ? <><Loader2 size={17} className={styles.spin} /> Creating your PDF…</> : <><ArrowDownToLine size={17} /> Export PDF <ChevronRight size={16} /></>}</button>
          {busy && <p className={styles.processingNote} role="status">Arranging {pageCount} pages in your browser. This may take a moment.</p>}
          {output && <div className={styles.successBox} role="status"><Check size={16} /><div><strong>PDF ready</strong><span>{output.pages} output {output.pages === 1 ? 'sheet' : 'sheets'}</span></div><a href={output.url} download={output.filename}><ArrowDownToLine size={14} /> Save PDF</a><a href={output.url} target="_blank" rel="noreferrer"><FileText size={14} /> Open PDF</a>{supportsFileShare && <button type="button" onClick={sharePdf}><Share2 size={14} /> Share</button>}</div>}
          {error && <p className={styles.errorMessage} role="alert">{error}</p>}
        </aside>
      </div>
    </main>
  </div>
}
