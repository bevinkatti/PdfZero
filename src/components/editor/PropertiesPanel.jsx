import React from 'react'
import { FileText, Layers, Info, Lock, Droplets, EyeOff, Palette } from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { addWatermark, downloadBytes } from '../../lib/pdfExporter.js'
import styles from './PropertiesPanel.module.css'

export default function PropertiesPanel() {
  const {
    selectedElement, selectedElementPage,
    file, fileName, pageCount, editLayers,
    updateTextBlock, commitExtractedEdit,
  } = usePdfStore()

  const totalEdits = Object.values(editLayers).reduce(
    (sum, layer) => sum + (layer.texts?.length || 0) + (layer.annotations?.length || 0), 0
  )

  // Update a property on the selected element (works for both store & extracted)
  const updateProp = (updates) => {
    if (!selectedElement || !selectedElementPage) return
    const targetId = selectedElement.isExtracted && !selectedElement.isEdited
      ? `edited-${selectedElement.id}`
      : selectedElement.id
    // For extracted blocks that haven't been committed yet, commitExtractedEdit
    // For store blocks (user-added or already-committed), updateTextBlock
    if (selectedElement.isExtracted && !selectedElement.isEdited) {
      commitExtractedEdit(selectedElementPage, selectedElement, selectedElement.str)
    }
    updateTextBlock(selectedElementPage, targetId, updates)
    // Also update selectedElement in store so UI reflects immediately
  }

  const handleWatermark = async () => {
    if (!file) return
    const text = window.prompt('Watermark text:', 'CONFIDENTIAL')
    if (!text) return
    const tid = toast.loading('Adding watermark...')
    try {
      const bytes = await addWatermark(file, text)
      downloadBytes(bytes, `watermarked-${fileName}`)
      toast.success('Downloaded!', { id: tid })
    } catch { toast.error('Failed', { id: tid }) }
  }

  // Clean font name for display
  const displayFont = (name) => {
    if (!name) return 'Unknown'
    return name
      .replace(/^[A-Z]{6}\+/, '')
      .replace(/-(Bold|Italic|Oblique|Regular)/gi, '')
      .replace(/^g_[a-z0-9]+_/i, '')
      .slice(0, 22)
  }

  return (
    <div className={styles.panel}>

      {/* Document info */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}><Info size={12} /> Document</div>
        <div className={styles.row}><span className={styles.lbl}>Pages</span><span className={styles.val}>{pageCount || '—'}</span></div>
        <div className={styles.row}><span className={styles.lbl}>Edits</span><span className={styles.val}>{totalEdits}</span></div>
        <div className={styles.row}><span className={styles.lbl}>File</span><span className={styles.val} style={{ fontSize: 10, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName || '—'}</span></div>
      </div>

      {/* Selection properties — only when something is selected */}
      {selectedElement ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Layers size={12} /> Selection</div>

          {/* Detected font badge */}
          <div className={styles.detectedFont}>
            <Palette size={11} />
            {displayFont(selectedElement.fontName)}
            {selectedElement.isExtracted && !selectedElement.isEdited && (
              <span className={styles.extractedBadge}>PDF original</span>
            )}
          </div>

          {/* Text preview */}
          <div className={styles.textPreview}>
            {selectedElement.str?.slice(0, 60) || '(empty)'}
            {(selectedElement.str?.length || 0) > 60 ? '…' : ''}
          </div>

          {/* Font family */}
          <div className={styles.row}>
            <span className={styles.lbl}>Font</span>
            <select
              className={styles.ctrl}
              defaultValue="Helvetica"
              onChange={e => updateProp({ fontName: e.target.value })}
            >
              {['Helvetica', 'Times New Roman', 'Times-Roman', 'Courier New', 'Courier', 'Georgia', 'Arial'].map(f => (
                <option key={f} value={f}>{f.replace('Times-Roman','Times Roman')}</option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div className={styles.row}>
            <span className={styles.lbl}>Size</span>
            <input
              type="number" min={4} max={200}
              className={styles.numCtrl}
              defaultValue={Math.round(selectedElement.fontSize || 12)}
              onChange={e => updateProp({ fontSize: Math.max(4, Number(e.target.value)) })}
            />
          </div>

          {/* Color — shows the DETECTED color from PDF */}
          <div className={styles.row}>
            <span className={styles.lbl}>Color</span>
            <div className={styles.colorRow}>
              <input
                type="color"
                className={styles.colorCtrl}
                defaultValue={selectedElement.color || '#000000'}
                onChange={e => updateProp({ color: e.target.value })}
              />
              <span className={styles.colorHex}>{selectedElement.color || '#000000'}</span>
            </div>
          </div>

          {/* Position readout */}
          <div className={styles.row}>
            <span className={styles.lbl}>X</span>
            <span className={styles.val} style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(selectedElement.x)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.lbl}>Y</span>
            <span className={styles.val} style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(selectedElement.y)}</span>
          </div>
        </div>
      ) : (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><Layers size={12} /> Selection</div>
          <div className={styles.emptyHint}>
            Click any text in the PDF to select it, then double-click to edit
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}><FileText size={12} /> Actions</div>
        <div className={styles.actionList}>
          <button className={styles.actionBtn} onClick={handleWatermark}>
            <Droplets size={13} /> Add watermark
          </button>
          <button className={styles.actionBtn} onClick={() => toast('Switch to Redact tool in toolbar, then drag over content', { icon: '🔲' })}>
            <EyeOff size={13} /> Redact content
          </button>
          <button className={styles.actionBtn} onClick={() => toast('Password protection — use the Tools page', { icon: '🔒' })}>
            <Lock size={13} /> Password protect
          </button>
        </div>
      </div>

      {/* Export as */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Export as</div>
        <div className={styles.actionList}>
          <button className={styles.actionBtn} onClick={() => toast('DOCX export — v1.1', { icon: '📄' })}>📄 Word (.docx)</button>
          <button className={styles.actionBtn} onClick={() => toast('Image export — v1.1', { icon: '🖼' })}>🖼 Images (PNG)</button>
          <button className={styles.actionBtn} onClick={() => toast('Plain text export — v1.1', { icon: '📋' })}>📋 Plain text</button>
        </div>
      </div>

    </div>
  )
}
