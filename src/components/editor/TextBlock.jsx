import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { Trash2, Copy, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import styles from './TextBlock.module.css'

// ══════════════════════════════════════════════════════════════════════════════
// THE SEJDA MODEL — exactly how professional PDF text editing works
//
// Layer stack (bottom → top):
//   1. <canvas>        — PDF raster, always visible
//   2. <div.textBlock> — transparent hit-area, opacity:0 normally
//   3. On hover        — opacity:1, border:dashed, background:LOCAL_BG →
//                        CSS text overlaid on canvas text with matching bg.
//   4. On edit         — background:LOCAL_BG, opacity:1, cursor:text
//                        User edits on a surface that matches the PDF bg.
//   5. After commit    — user-added block uses LOCAL_BG to cover original
//                        canvas text seamlessly (no white patch).
//
// WHY localBg not pageBg:
//   pageBg is sampled from page corners — it's a single flat color.
//   localBg is sampled from the canvas at the exact position of THIS text
//   block. This matches watermarks, seals, gradients, colored regions.
//   Result: edited text blends perfectly like in Sejda — no patchy white.
//
// WHY opacity:0 not color:transparent:
//   color:transparent makes text invisible but keeps the div fully in layout.
//   Any border or background on the div is still opaque — causing ghost copies.
//   opacity:0 makes the ENTIRE div invisible — div, border, background, text.
//   On hover/select, we flip to opacity:1.
//
// WHY line-height:1 not 1.25:
//   line-height:1.25 adds 25% spacing above+below the glyph.
//   The div becomes taller than the visible text, misaligning the border.
//   line-height:1 = the div height exactly matches the glyph height.
//
// WHY padding:0:
//   padding:0 2px shifts text 2px right, misaligning with PDF canvas text.
//   Zero padding = text starts exactly at the div's left edge = tx[4].
// ══════════════════════════════════════════════════════════════════════════════

export default function TextBlock({
  block, pageNum,
  isExtracted = false,
  pageBg = 'white',
  getLocalBg,
  forceEdit = false,
  onEditStart,
  onEditEnd,
}) {
  const {
    selectedElement, setSelectedElement,
    updateTextBlock, removeTextBlock, commitExtractedEdit,
    zoom,
  } = usePdfStore()

  const divRef = useRef(null)
  const dragRef = useRef(null)

  const [editing, setEditing] = useState(false)
  const [draftText, setDraftText] = useState(block.str)
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState({ x: block.x, y: block.y })
  const [dragging, setDragging] = useState(false)

  const isSelected = selectedElement?.id === block.id

  // Sync from props
  useEffect(() => { if (!dragging) setPos({ x: block.x, y: block.y }) }, [block.x, block.y, dragging])
  useEffect(() => { if (!editing) setDraftText(block.str) }, [block.str, editing])

  // forceEdit from parent (context toolbar "Edit" button)
  useEffect(() => {
    if (forceEdit && !editing) startEdit()
    else if (!forceEdit && editing) doCommit()
  }, [forceEdit])

  // Focus when editing starts
  useEffect(() => {
    if (!editing || !divRef.current) return
    const el = divRef.current
    requestAnimationFrame(() => {
      el.focus()
      // Cursor at end (Sejda default)
      try {
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      } catch (_) { }
    })
  }, [editing])

  // Deselect → commit
  useEffect(() => { if (!isSelected && editing) doCommit() }, [isSelected])

  const startEdit = () => {
    setEditing(true)
    onEditStart?.()
  }

  const doCommit = useCallback(() => {
    if (!editing) return
    setEditing(false)
    onEditEnd?.()
    const raw = divRef.current?.innerText ?? draftText
    const newStr = raw.replace(/\n+$/, '').replace(/\r/g, '')
    setDraftText(newStr)
    if (newStr === block.str) return

    if (isExtracted) {
      commitExtractedEdit(pageNum, block, newStr)
      toast.success('✓ Saved', { duration: 1000 })
    } else {
      updateTextBlock(pageNum, block.id, { str: newStr })
    }
  }, [editing, draftText, block, isExtracted, pageNum, commitExtractedEdit, updateTextBlock, onEditEnd])

  const doCancel = useCallback(() => {
    setEditing(false)
    onEditEnd?.()
    setDraftText(block.str)
    if (divRef.current) divRef.current.innerText = block.str
  }, [block.str, onEditEnd])

  const handleClick = (e) => { e.stopPropagation(); if (!isSelected) setSelectedElement(block, pageNum) }
  const handleDoubleClick = (e) => { e.stopPropagation(); setSelectedElement(block, pageNum); startEdit() }
  const handleMouseEnter = () => setHovered(true)
  const handleMouseLeave = () => setHovered(false)

  const handleKeyDown = (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); doCancel() }
    if (e.key === 'Enter' && !e.shiftKey && editing) { e.preventDefault(); doCommit() }
  }

  const handleBlur = (e) => {
    if (divRef.current?.contains(e.relatedTarget)) return
    doCommit()
  }

  // Drag
  const handleMouseDown = (e) => {
    if (editing) return
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { ox: e.clientX / zoom - pos.x, oy: e.clientY / zoom - pos.y }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) return
    const onMove = (e) => setPos({ x: e.clientX / zoom - dragRef.current.ox, y: e.clientY / zoom - dragRef.current.oy })
    const onUp = () => { setDragging(false); if (!isExtracted) updateTextBlock(pageNum, block.id, { x: pos.x, y: pos.y }) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging, zoom, pos, pageNum, block.id, isExtracted, updateTextBlock])

  // ── Typography ─────────────────────────────────────────────────────────────
  const fontFamily = block.fontFamily || 'Arial, Helvetica, sans-serif'
  const fontWeight = block.fontBold ? 700 : 400
  const fontStyle = block.fontItalic ? 'italic' : 'normal'
  const fontSize = Math.max(block.fontSize || 12, 4)

  // ── Visibility model (SEJDA-STYLE — local background matching) ──────────
  //
  // The key insight from Sejda: after editing, the text block's background
  // should match the local PDF background at that exact position — not a
  // flat white. This makes edits invisible (no patchy white rectangles).
  //
  // extracted + not selected + not hovered:
  //   opacity:0 — completely invisible, canvas shows through perfectly
  //
  // extracted + hovered (not editing):
  //   opacity:1, background:LOCAL_BG, border:dashed-blue
  //   Covers canvas text with matching bg — clean, no white patch.
  //
  // extracted + selected (not editing):
  //   opacity:1, background:transparent, border:solid-blue
  //
  // editing (extracted):
  //   opacity:1, background:LOCAL_BG, border:solid-blue
  //   User edits on a surface that matches the PDF background.
  //
  // user-added (isEdited or new block):
  //   opacity:1, background:LOCAL_BG — blends seamlessly with surrounding PDF.

  const isUserAdded = !isExtracted || block.isEdited

  // Sample the local background color at this block's position
  const localBg = useMemo(() => {
    if (getLocalBg) {
      const w = block.width || fontSize * draftText.length * 0.6
      const h = block.height || fontSize * 1.1
      return getLocalBg(pos.x, pos.y, w, h)
    }
    return pageBg || 'white'
  }, [getLocalBg, pos.x, pos.y, block.width, block.height, fontSize, draftText.length, pageBg])

  let opacity = 1
  let background = 'transparent'
  let borderColor = 'transparent'
  let cursor = 'default'

  if (isUserAdded) {
    // Edited/new blocks — use local bg to blend with surrounding PDF content
    opacity = 1
    background = localBg
    borderColor = editing ? '#3b82f6' : isSelected ? '#3b82f6' : 'rgba(232,69,69,0.35)'
    cursor = editing ? 'text' : 'grab'
  } else if (editing) {
    // Editing extracted text — local bg covers canvas text cleanly
    opacity = 1
    background = localBg
    borderColor = '#3b82f6'
    cursor = 'text'
  } else if (isSelected) {
    opacity = 1
    background = 'transparent'
    borderColor = '#3b82f6'
    cursor = 'grab'
  } else if (hovered) {
    // Local bg covers canvas text — blends with PDF background
    opacity = 1
    background = localBg
    borderColor = 'rgba(59,130,246,0.6)'
    cursor = 'text'
  } else {
    // Completely invisible — canvas renders perfectly, no overlay at all
    opacity = 0
    background = 'transparent'
    borderColor = 'transparent'
    cursor = 'default'
  }

  // ── Feathered edges: soft blend for committed edits ──────────────────────
  // Instead of a hard rectangle, use:
  // 1. box-shadow halo (same color as bg) → soft glow at edges
  // 2. slight padding extension → bg extends a bit beyond text
  // 3. transparent border → no visible hard line
  // This makes the patch invisible — it blends into the PDF background.
  const isCommitted = isUserAdded && !editing && !isSelected
  const featherPad = isCommitted ? 2 : 0   // px of extra padding for soft bg
  const featherShadow = isCommitted
    ? `0 0 6px 4px ${localBg}`              // soft halo with local bg color
    : editing
      ? '0 0 0 2px rgba(59,130,246,0.15)'   // blue glow when editing
      : 'none'

  // Hide hard border for committed edits — the feathered bg replaces it
  if (isCommitted) {
    borderColor = 'transparent'
  }

  // ── Width: grow right as you type, never wrap ──────────────────────────────
  if (block.isEdited && !editing) background = 'transparent'

  const baseWidth = block.width || fontSize * draftText.length * 0.6
  const visualTextBox = editing || block.isEdited || !isExtracted
  const widthStyle = visualTextBox
    ? {
        width: 'max-content',
        minWidth: Math.max(fontSize * 0.75, 8),
        maxWidth: 'none',
        clipPath: `inset(0 0 ${Math.max((block.height || fontSize) - fontSize * 1.08, 0)}px 0)`,
      }
    : { width: baseWidth, minWidth: 'unset', maxWidth: 'none' }
  const heightStyle = visualTextBox
    ? { minHeight: Math.max(fontSize, 6) }
    : { minHeight: Math.max(block.height || fontSize * 1.1, 6) }

  return (
    <div
      ref={divRef}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={editing}
      style={{
        // Layout
        position: 'absolute',
        left: pos.x - featherPad,
        top: pos.y - featherPad,
        ...widthStyle,
        minHeight: Math.max(block.height || fontSize * 1.1, 6) + featherPad * 2,
        // ── The critical rendering properties ──
        // line-height:1 → no extra spacing, box height = glyph height exactly
        lineHeight: 1,
        // Padding: 0 normally, slight extension for feathered committed edits
        padding: featherPad,
        margin: 0,
        // Typography must match PDF raster
        fontSize,
        fontFamily,
        fontWeight,
        fontStyle,
        textDecoration: block.fontUnderline ? 'underline' : 'none',
        letterSpacing: 0,
        // Visibility
        opacity,
        background,
        color: block.color || '#000000',
        border: `1.5px solid ${borderColor}`,
        borderRadius: isCommitted ? 2 : 1,
        // Interaction
        cursor,
        userSelect: editing ? 'text' : 'none',
        zIndex: editing ? 30 : block.isEdited ? 9 : isSelected ? 12 : 10,
        // No wrapping (grows right like Sejda)
        whiteSpace: 'pre',
        overflow: 'visible',
        outline: 'none',
        boxSizing: 'content-box',
        // Smooth visibility toggle
        transition: editing ? 'none' : 'opacity 80ms, border-color 80ms',
        // Feathered shadow for committed edits, blue glow when editing
        boxShadow: featherShadow,
      }}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      title={editing ? undefined : 'Double-click to edit'}
    >
      {block.isEdited && !editing && block.originalStr && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            color: pageBg || 'white',
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 0,
          }}
        >
          {block.originalStr}
        </span>
      )}
      <span style={{ position: 'relative', zIndex: 1 }}>{draftText}</span>
    </div>
  )
}

// ── Context toolbar (sibling of TextBlock, not inside contentEditable) ────────
// Button sizing follows Apple/Google's ~40px minimum touch-target guidance —
// the previous 26px-tall buttons with 12px icons were comfortable with a
// mouse cursor but too small to tap reliably with a finger.
export function TextContextToolbar({ block, pageNum, pos, onEdit }) {
  const { removeTextBlock, updateTextBlock, setSelectedElement } = usePdfStore()

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: Math.max(2, pos.y - 50),
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#18181b',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 10,
        padding: '5px 6px',
        zIndex: 40,
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        pointerEvents: 'all',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
      onClick={e => e.stopPropagation()}
    >
      {[
        { label: '✏️ Edit', action: () => onEdit(), },
        { label: null }, // separator
        {
          icon: <Copy size={16} />, title: 'Duplicate', action: () => {
            const clone = { ...block, id: `new-${Date.now()}`, x: pos.x + 14, y: pos.y + 14, isExtracted: false, isEdited: false, originalId: undefined }
            updateTextBlock(pageNum, clone.id, clone)
            toast.success('Duplicated')
          }
        },
        { icon: <Wand2 size={16} />, title: 'AI font match', action: () => toast('AI font match — v1.1', { icon: '✨' }) },
        { label: null }, // separator
        {
          icon: <Trash2 size={16} />, title: 'Delete', danger: true, action: () => {
            removeTextBlock(pageNum, block.id)
            setSelectedElement(null, null)
            toast.success('Removed')
          }
        },
      ].map((item, i) => {
        if (item.label === null) return (
          <div key={i} style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', margin: '0 3px' }} />
        )
        return (
          <button key={i} title={item.title} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); item.action() }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              minWidth: 40, height: 40, padding: '0 12px',
              border: 'none', borderRadius: 7, background: 'transparent',
              color: item.danger ? '#f87171' : '#a1a1aa',
              fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >
            {item.label || item.icon}
          </button>
        )
      })}
    </div>
  )
}
