import React, { useState, useEffect } from 'react'
import {
  MousePointer2, Type, Image, Pencil, Square, PenLine,
  Highlighter, EyeOff, Undo2, Redo2, ZoomIn, ZoomOut,
  Download, Scan, Sparkles, Loader2, Bold, Italic, Underline
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { exportPdf, downloadBytes } from '../../lib/pdfExporter.js'
import { renderPage } from '../../lib/pdfRenderer.js'
import { ocrCanvas } from '../../lib/ocrEngine.js'
import DropZone from '../ui/DropZone.jsx'
import styles from './EditorToolbar.module.css'

const TOOLS = [
  { id: 'select',    icon: MousePointer2, label: 'Select & edit text' },
  { id: 'text',      icon: Type,          label: 'Add text box' },
  { id: 'image',     icon: Image,         label: 'Add image' },
  { id: 'draw',      icon: Pencil,        label: 'Draw' },
  { id: 'shape',     icon: Square,        label: 'Shape' },
  { id: 'sign',      icon: PenLine,       label: 'Sign' },
  { id: 'highlight', icon: Highlighter,   label: 'Highlight' },
  { id: 'redact',    icon: EyeOff,        label: 'Redact' },
]

const FONTS = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
  'Courier New', 'Verdana', 'Tahoma', 'Trebuchet MS',
  'Calibri', 'Cambria', 'Garamond', 'Palatino',
]

export default function EditorToolbar() {
  const {
    activeTool, setActiveTool, zoom, setZoom,
    file, editLayers, pageCount, fileName, pageBgs,
    currentPage, addTextBlock,
    selectedElement, selectedElementPage,
    updateTextBlock, commitExtractedEdit,
    undoEdit, redoEdit,
  } = usePdfStore()

  const [ocrRunning,   setOcrRunning]   = useState(false)
  const [ocrProgress,  setOcrProgress]  = useState(0)

  // Mirror selected element's current formatting in the toolbar
  const sel = selectedElement
  const [fontFamily, setFontFamily] = useState('Arial')
  const [fontSize,   setFontSize]   = useState(12)
  const [bold,       setBold]       = useState(false)
  const [italic,     setItalic]     = useState(false)
  const [underline,  setUnderline]  = useState(false)
  const [color,      setColor]      = useState('#000000')

  // Sync toolbar state when selection changes
  useEffect(() => {
    if (!sel) return
    // Extract CSS font-family to a simple name for the dropdown
    const rawFamily = sel.fontFamily || 'Arial'
    const match = FONTS.find(f => rawFamily.toLowerCase().includes(f.toLowerCase()))
    setFontFamily(match || 'Arial')
    setFontSize(Math.round(sel.fontSize || 12))
    setBold(sel.fontBold   || false)
    setItalic(sel.fontItalic || false)
    setUnderline(sel.fontUnderline || false)
    setColor(sel.color || '#000000')
  }, [sel?.id, sel?.fontBold, sel?.fontItalic, sel?.fontSize, sel?.color])

  // Apply a formatting update to the selected element
  const applyFormat = (updates) => {
    if (!sel || !selectedElementPage) return

    if (sel.isExtracted && !sel.isEdited) {
      // Commit the extracted block first, then update
      commitExtractedEdit(selectedElementPage, sel, sel.str)
      updateTextBlock(selectedElementPage, `edited-${sel.id}`, updates)
    } else {
      updateTextBlock(selectedElementPage, sel.id, updates)
    }
  }

  const handleFontFamily = (f) => {
    setFontFamily(f)
    // Map display name to CSS stack
    const cssMap = {
      'Arial':          'Arial, "Noto Sans", Helvetica, sans-serif',
      'Helvetica':      'Helvetica, Arial, sans-serif',
      'Times New Roman':'"Times New Roman", "Noto Serif", Times, serif',
      'Georgia':        'Georgia, "Noto Serif", serif',
      'Courier New':    '"Courier New", Courier, monospace',
      'Verdana':        'Verdana, Arial, sans-serif',
      'Tahoma':         'Tahoma, Arial, sans-serif',
      'Trebuchet MS':   '"Trebuchet MS", Arial, sans-serif',
      'Calibri':        'Calibri, Arial, sans-serif',
      'Cambria':        'Cambria, Georgia, serif',
      'Garamond':       'Garamond, Georgia, serif',
      'Palatino':       '"Palatino Linotype", Georgia, serif',
    }
    applyFormat({ fontFamily: cssMap[f] || f, fontName: f })
  }

  const handleFontSize = (v) => {
    const n = Math.max(4, Math.min(200, Number(v)))
    setFontSize(n)
    applyFormat({ fontSize: n })
  }

  const handleBold = () => {
    const next = !bold
    setBold(next)
    applyFormat({ fontBold: next })
  }

  const handleItalic = () => {
    const next = !italic
    setItalic(next)
    applyFormat({ fontItalic: next })
  }

  const handleUnderline = () => {
    const next = !underline
    setUnderline(next)
    applyFormat({ fontUnderline: next })
  }

  const handleColor = (v) => {
    setColor(v)
    applyFormat({ color: v })
  }

  const handleUndo = () => {
    if (!undoEdit()) { toast('Nothing to undo'); return }
    toast('Undone', { duration: 800 })
  }

  const handleRedo = () => {
    if (!redoEdit()) { toast('Nothing to redo'); return }
    toast('Redone', { duration: 800 })
  }

  const handleExport = async () => {
    if (!file) { toast.error('No PDF loaded'); return }
    const tid = toast.loading('Exporting PDF...')
    try {
      const bytes = await exportPdf(file, editLayers, pageCount, pageBgs)
      downloadBytes(bytes, `pdfzero-${fileName || 'edited.pdf'}`)
      toast.success('PDF downloaded!', { id: tid })
    } catch (e) {
      toast.error('Export failed: ' + e.message, { id: tid })
    }
  }

  const handleOcr = async () => {
    if (!file || ocrRunning) return
    setOcrRunning(true); setOcrProgress(0)
    const tid = toast.loading('Starting OCR...')
    try {
      const { canvas } = await renderPage(currentPage, 1)
      const words = await ocrCanvas(canvas, pct => {
        setOcrProgress(pct)
        toast.loading(`OCR: ${pct}%`, { id: tid })
      })
      if (!words.length) { toast.error('No text found', { id: tid }); return }
      words.forEach(w => addTextBlock(currentPage, w))
      toast.success(`Found ${words.length} words`, { id: tid })
    } catch (e) {
      toast.error('OCR failed: ' + e.message, { id: tid })
    } finally { setOcrRunning(false); setOcrProgress(0) }
  }

  const hasSelection = !!sel

  return (
    <div className={styles.toolbar}>
      <DropZone compact />
      <div className={styles.sep} />

      {/* Drawing tools */}
      <div className={styles.toolGroup}>
        {TOOLS.map(({ id, icon: Icon, label }) => (
          <button key={id}
            className={`${styles.toolBtn} ${activeTool === id ? styles.active : ''}`}
            onClick={() => setActiveTool(id)} title={label} aria-label={label}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <div className={styles.sep} />

      {/* Font family */}
      <select
        className={styles.select}
        value={fontFamily}
        onChange={e => handleFontFamily(e.target.value)}
        disabled={!hasSelection}
        title="Font family"
        aria-label="Font family"
      >
        {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
      </select>

      {/* Font size */}
      <input
        type="number"
        className={styles.numInput}
        value={fontSize}
        min={4} max={200}
        disabled={!hasSelection}
        onChange={e => handleFontSize(e.target.value)}
        title="Font size"
        aria-label="Font size"
      />

      {/* Bold */}
      <button
        className={`${styles.fmtBtn} ${bold ? styles.fmtActive : ''}`}
        onClick={handleBold}
        disabled={!hasSelection}
        title="Bold (affects export)"
        aria-label="Bold"
        aria-pressed={bold}
      >
        <Bold size={14} />
      </button>

      {/* Italic */}
      <button
        className={`${styles.fmtBtn} ${italic ? styles.fmtActive : ''}`}
        onClick={handleItalic}
        disabled={!hasSelection}
        title="Italic (affects export)"
        aria-label="Italic"
        aria-pressed={italic}
      >
        <Italic size={14} />
      </button>

      {/* Underline — CSS only, marks in store */}
      <button
        className={`${styles.fmtBtn} ${underline ? styles.fmtActive : ''}`}
        onClick={handleUnderline}
        disabled={!hasSelection}
        title="Underline"
        aria-label="Underline"
        aria-pressed={underline}
      >
        <Underline size={14} />
      </button>

      <div className={styles.sep} />

      {/* Color */}
      <input
        type="color"
        className={styles.colorPicker}
        value={color}
        disabled={!hasSelection}
        onChange={e => handleColor(e.target.value)}
        title="Text color"
        aria-label="Text color"
      />

      <div className={styles.sep} />

      {/* Undo / Redo */}
      <button className={styles.toolBtn} onClick={handleUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        <Undo2 size={15} />
      </button>
      <button className={styles.toolBtn} onClick={handleRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
        <Redo2 size={15} />
      </button>

      <div className={styles.sep} />

      {/* Zoom */}
      <button className={styles.toolBtn} onClick={() => setZoom(zoom - 0.2)} title="Zoom out"><ZoomOut size={15} /></button>
      <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
      <button className={styles.toolBtn} onClick={() => setZoom(zoom + 0.2)} title="Zoom in"><ZoomIn size={15} /></button>

      <div className={styles.spacer} />

      <button
        className={`${styles.aiBtn} ${ocrRunning ? styles.aiBtnActive : ''}`}
        onClick={handleOcr} disabled={ocrRunning || !file}
      >
        {ocrRunning
          ? <><Loader2 size={13} className={styles.spin} /> OCR {ocrProgress}%</>
          : <><Scan size={13} /> OCR</>}
      </button>

      <button className={styles.aiBtn} onClick={() => toast('AI font match — v1.1', { icon: '✨' })}>
        <Sparkles size={13} /> AI fix
      </button>

      <div className={styles.sep} />

      <button className={styles.exportBtn} onClick={handleExport} disabled={!file}>
        <Download size={14} /> Download PDF
      </button>
    </div>
  )
}
