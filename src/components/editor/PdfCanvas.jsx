import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { renderPage, extractTextItems, detectPageBackground, sampleLocalBackground, BASE_SCALE } from '../../lib/pdfRenderer.js'
import TextBlock, { TextContextToolbar } from './TextBlock.jsx'
import AnnotationLayer from './AnnotationLayer.jsx'
import styles from './PdfCanvas.module.css'

export default function PdfCanvas() {
  const {
    file, currentPage, zoom, activeTool,
    editLayers, addTextBlock, getLayer,
    setSelectedElement, selectedElement, selectedElementPage,
    pageCount, extractedEdits,
    setPageBg: storeSetPageBg,
  } = usePdfStore()

  const canvasRef    = useRef(null)
  const containerRef = useRef(null)
  const renderIdRef  = useRef(0)

  const [baseSize,    setBaseSize]    = useState({ width: 794, height: 1123 })
  const [isRendering, setIsRendering] = useState(false)
  const [textItems,   setTextItems]   = useState([])
  const [pageBg,      setPageBgLocal] = useState('white')
  // Per-block editing state — lifted here so context toolbar can trigger edit
  const [editingId,   setEditingId]   = useState(null)

  const setPageBg = (bg) => { setPageBgLocal(bg); storeSetPageBg(currentPage, bg) }

  /* ── Render PDF canvas ── */
  useEffect(() => {
    if (!file || !currentPage) return
    const id = ++renderIdRef.current
    setIsRendering(true)

    renderPage(currentPage, zoom)
      .then(({ canvas, width, height }) => {
        if (id !== renderIdRef.current) return
        setBaseSize({ width: width / zoom, height: height / zoom })
        const el = canvasRef.current
        if (!el) return
        el.width  = canvas.width
        el.height = canvas.height
        el.style.width  = width  + 'px'
        el.style.height = height + 'px'
        el.getContext('2d').drawImage(canvas, 0, 0)
        setPageBg(detectPageBackground(canvas))
        setIsRendering(false)
      })
      .catch(e => {
        if (id !== renderIdRef.current) return
        setIsRendering(false)
        toast.error('Render error: ' + e.message)
      })
  }, [file, currentPage, zoom])

  /* ── Extract text once per page ── */
  useEffect(() => {
    if (!file || !currentPage) return
    setTextItems([])
    setEditingId(null)
    extractTextItems(currentPage)
      .then(setTextItems)
      .catch(() => setTextItems([]))
  }, [file, currentPage])

  /* ── Canvas background click ── */
  const handleClick = useCallback((e) => {
    const isBg = e.target === containerRef.current || e.target === canvasRef.current
    if (isBg) { setSelectedElement(null, null); setEditingId(null) }
    if (activeTool !== 'text' || !isBg) return

    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left)  / zoom
    const y = (e.clientY - rect.top)   / zoom
    const newBlock = {
      id: `new-${Date.now()}`, str: 'New text',
      x, y, width: 120, height: 20,
      fontSize: 14, fontName: 'Helvetica',
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontBold: false, fontItalic: false,
      stdFont: 'Helvetica', color: '#000000',
    }
    addTextBlock(currentPage, newBlock)
    setSelectedElement(newBlock, currentPage)
    setEditingId(newBlock.id)
  }, [activeTool, currentPage, zoom, addTextBlock, setSelectedElement])

  // ── Local background sampler — each TextBlock calls this to get the
  //    exact background color from the canvas at its own position.
  //    Scale = zoom * dpr (text coords are already in BASE_SCALE space). ──
  const getLocalBg = useCallback((x, y, w, h) => {
    if (!canvasRef.current) return pageBg || 'white'
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const canvasScale = zoom * dpr  // NOT BASE_SCALE * zoom * dpr
    return sampleLocalBackground(canvasRef.current, x, y, w, h, canvasScale) || pageBg || 'white'
  }, [zoom, pageBg])

  if (!file) return null

  const scaledW = baseSize.width  * zoom
  const scaledH = baseSize.height * zoom
  const layer   = getLayer(currentPage)

  // IDs that have committed edits — hide originals for those
  const editedOriginalIds = new Set(
    (layer.texts || [])
      .filter(t => t.isEdited && t.originalId)
      .map(t => t.originalId)
  )

  // Selected block for context toolbar
  const selectedBlock = selectedElement && selectedElementPage === currentPage
    ? (textItems.find(t => t.id === selectedElement.id)
       || (layer.texts || []).find(t => t.id === selectedElement.id))
    : null

  const isEditing = selectedBlock && editingId === selectedBlock?.id
  const editedTextBlocks = (layer.texts || []).filter(block => block.isEdited && block.originalId)

  return (
    <div className={styles.wrapper}>
      <div className={styles.pageLabel}>
        Page {currentPage} / {pageCount} &nbsp;·&nbsp; {Math.round(zoom * 100)}%
      </div>

      <div style={{ position:'relative', width:scaledW, height:scaledH, flexShrink:0 }}>
        {/* Inner container at BASE_SCALE, CSS-scaled by zoom */}
        <div
          ref={containerRef}
          className={`${styles.pageContainer} ${activeTool==='text' ? styles.cursorText : ''}`}
          style={{
            width:  baseSize.width,
            height: baseSize.height,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
          onClick={handleClick}
        >
          {/* PDF raster */}
          <canvas ref={canvasRef} className={styles.canvas} />

          {isRendering && (
            <div className={styles.loadingOverlay}>
              <div className={styles.spinner} />
            </div>
          )}

          {/* Extracted text overlays */}
          {textItems
            .filter(item => !editedOriginalIds.has(item.id))
            .map(item => (
              <TextBlock
                key={item.id}
                block={item}
                pageNum={currentPage}
                isExtracted
                pageBg={pageBg}
                getLocalBg={getLocalBg}
                forceEdit={editingId === item.id}
                onEditStart={() => setEditingId(item.id)}
                onEditEnd={()   => setEditingId(null)}
              />
            ))
          }

          {/* Covers the original PDF raster text even after an edit is moved.
              Uses local background sampling + blur for feathered edges. */}
          {editedTextBlocks.map(block => {
            const fontSize = block.originalFontSize || block.fontSize || 12
            const width = Math.max(block.originalWidth || block.width || fontSize * 4, 1)
            const height = Math.max(block.originalHeight || block.height || fontSize, 1)
            const cx = (block.originalX ?? block.x)
            const cy = (block.originalY ?? block.y)
            // Sample the actual local background color from the canvas
            const dpr = Math.min(window.devicePixelRatio || 1, 2)
            const canvasScale = zoom * dpr  // NOT BASE_SCALE * zoom * dpr
            const localBg = canvasRef.current
              ? (sampleLocalBackground(canvasRef.current, cx, cy, width, height, canvasScale) || pageBg || 'white')
              : (pageBg || 'white')


            // Expand slightly + blur to create feathered edges instead of hard rectangle
            const pad = 2
            return (
              <div
                key={`cover-${block.id}`}
                style={{
                  position: 'absolute',
                  left: cx - 0.75,//cx - pad,
                  top: cy - pad,
                  width: width + pad * 2,
                  height: height + pad * 2,
                  background: localBg,
                  filter: 'blur(1px)',
                  pointerEvents: 'none',
                  zIndex: 8,
                  borderRadius: 2,
                }}
              />
            )
          })}

          {/* User-added + committed edits */}
          {(layer.texts || []).map(block => (
            <TextBlock
              key={block.id}
              block={block}
              pageNum={currentPage}
              isExtracted={false}
              pageBg={pageBg}
              getLocalBg={getLocalBg}
              forceEdit={editingId === block.id}
              onEditStart={() => setEditingId(block.id)}
              onEditEnd={()   => setEditingId(null)}
            />
          ))}

          {/* Context toolbar — rendered OUTSIDE contentEditable */}
          {selectedBlock && !isEditing && (
            <TextContextToolbar
              block={selectedBlock}
              pageNum={currentPage}
              pos={{ x: selectedBlock.x, y: selectedBlock.y }}
              onEdit={() => setEditingId(selectedBlock.id)}
              onClose={() => setSelectedElement(null, null)}
            />
          )}

          <AnnotationLayer
            pageNum={currentPage}
            pageSize={baseSize}
            activeTool={activeTool}
          />
        </div>
      </div>
    </div>
  )
}
