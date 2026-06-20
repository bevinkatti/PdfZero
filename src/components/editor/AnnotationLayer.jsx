import React, { useRef, useState } from 'react'
import { usePdfStore } from '../../store/pdfStore.js'
import styles from './AnnotationLayer.module.css'

export default function AnnotationLayer({ pageNum, pageSize, activeTool }) {
  const { addAnnotation, editLayers } = usePdfStore()
  const svgRef = useRef(null)
  const [drawing, setDrawing] = useState(null)

  const isDrawable = ['highlight', 'redact', 'shape', 'draw'].includes(activeTool)

  const getPos = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleMouseDown = (e) => {
    if (!isDrawable) return
    const pos = getPos(e)
    setDrawing({ startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, w: 0, h: 0 })
  }

  const handleMouseMove = (e) => {
    if (!drawing) return
    const pos = getPos(e)
    setDrawing((d) => ({
      ...d,
      x: Math.min(pos.x, d.startX),
      y: Math.min(pos.y, d.startY),
      w: Math.abs(pos.x - d.startX),
      h: Math.abs(pos.y - d.startY),
    }))
  }

  const handleMouseUp = () => {
    if (!drawing || drawing.w < 4 || drawing.h < 4) { setDrawing(null); return }

    const typeMap = {
      highlight: 'highlight',
      redact: 'redact',
      shape: 'rect',
      draw: 'rect',
    }

    addAnnotation(pageNum, {
      id: `ann-${Date.now()}`,
      type: typeMap[activeTool] || 'rect',
      x: drawing.x,
      y: drawing.y,
      width: drawing.w,
      height: drawing.h,
      color: activeTool === 'highlight' ? '#fbbf24' : '#e84545',
    })
    setDrawing(null)
  }

  const annotations = editLayers[pageNum]?.annotations || []

  const fillMap = {
    highlight: 'rgba(251,191,36,0.35)',
    redact:    'rgba(0,0,0,1)',
    rect:      'rgba(232,69,69,0.08)',
  }
  const strokeMap = {
    highlight: 'rgba(251,191,36,0.6)',
    redact:    'transparent',
    rect:      '#e84545',
  }

  return (
    <svg
      ref={svgRef}
      className={`${styles.svg} ${isDrawable ? styles.drawable : ''}`}
      width={pageSize.width}
      height={pageSize.height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {annotations.map((ann) => (
        <rect
          key={ann.id}
          x={ann.x} y={ann.y}
          width={ann.width} height={ann.height}
          fill={fillMap[ann.type] || 'rgba(232,69,69,0.1)'}
          stroke={strokeMap[ann.type] || '#e84545'}
          strokeWidth={ann.type === 'redact' ? 0 : 1.5}
          rx={ann.type === 'rect' ? 2 : 0}
        />
      ))}

      {/* Live drawing preview */}
      {drawing && (
        <rect
          x={drawing.x} y={drawing.y}
          width={drawing.w} height={drawing.h}
          fill={activeTool === 'highlight' ? 'rgba(251,191,36,0.3)' : activeTool === 'redact' ? 'rgba(0,0,0,0.7)' : 'rgba(232,69,69,0.08)'}
          stroke={activeTool === 'highlight' ? '#fbbf24' : activeTool === 'redact' ? 'transparent' : '#e84545'}
          strokeWidth={1.5}
          strokeDasharray={activeTool === 'shape' ? '4 2' : 'none'}
          rx={2}
        />
      )}
    </svg>
  )
}
