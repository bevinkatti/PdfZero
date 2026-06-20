import React, { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, RotateCcw, Copy } from 'lucide-react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../../store/pdfStore.js'
import { renderThumbnail } from '../../lib/pdfRenderer.js'
import { rotatePdf, removePageFromPdf, addPageToPdf, downloadBytes } from '../../lib/pdfExporter.js'
import styles from './PageThumbnails.module.css'

export default function PageThumbnails() {
  const { pageCount, currentPage, setCurrentPage, file, setFile, fileName } = usePdfStore()
  const [thumbs, setThumbs] = useState({})
  const [contextMenu, setContextMenu] = useState(null)
  const activeThumbRef = useRef(null)

  useEffect(() => {
    if (!file || !pageCount) return
    // Render thumbnails at low scale
    for (let i = 1; i <= pageCount; i++) {
      renderThumbnail(i).then((dataUrl) => {
        setThumbs((prev) => ({ ...prev, [i]: dataUrl }))
      }).catch(() => {})
    }
  }, [file, pageCount])

  useEffect(() => {
    activeThumbRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentPage])

  const handleRightClick = (e, pageNum) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, pageNum })
  }

  const closeMenu = () => setContextMenu(null)

  const handleRotate = async () => {
    if (!file || !contextMenu) return
    try {
      const bytes = await rotatePdf(file, contextMenu.pageNum, 90)
      setFile(bytes, fileName, bytes.byteLength)
      toast.success('Page rotated')
    } catch { toast.error('Rotation failed') }
    closeMenu()
  }

  const handleDelete = async () => {
    if (!file || !contextMenu || pageCount <= 1) return
    try {
      const bytes = await removePageFromPdf(file, contextMenu.pageNum)
      setFile(bytes, fileName, bytes.byteLength)
      if (currentPage > 1) setCurrentPage(currentPage - 1)
      toast.success('Page deleted')
    } catch { toast.error('Delete failed') }
    closeMenu()
  }

  const handleAddPage = async () => {
    if (!file) return
    try {
      const pos = pageCount
      const bytes = await addPageToPdf(file, pos)
      setFile(bytes, fileName, bytes.byteLength)
      toast.success('Blank page added')
    } catch { toast.error('Failed to add page') }
  }

  return (
    <div className={styles.panel} onClick={closeMenu}>
      <div className={styles.header}>
        <span className={styles.label}>Pages</span>
        <span className={styles.count}>{pageCount}</span>
      </div>

      <div className={styles.list}>
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((num) => (
          <div
            key={num}
            ref={currentPage === num ? activeThumbRef : null}
            className={`${styles.thumb} ${currentPage === num ? styles.active : ''}`}
            onClick={() => setCurrentPage(num)}
            onContextMenu={(e) => handleRightClick(e, num)}
          >
            {thumbs[num]
              ? <img src={thumbs[num]} alt={`Page ${num}`} className={styles.thumbImg} />
              : <div className={`skeleton ${styles.thumbSkeleton}`} />
            }
            <span className={styles.pageNum}>{num}</span>
          </div>
        ))}
      </div>

      <button className={styles.addBtn} onClick={handleAddPage}>
        <Plus size={14} />
        Add blank page
      </button>

      {contextMenu && (
        <div
          className={styles.ctxMenu}
          style={{ top: contextMenu.y - 60, left: contextMenu.x - 180 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleRotate}><RotateCcw size={13} /> Rotate 90°</button>
          <button onClick={() => { toast('Duplicate coming soon'); closeMenu() }}><Copy size={13} /> Duplicate</button>
          <div className={styles.ctxDivider} />
          <button onClick={handleDelete} className={styles.ctxDanger}><Trash2 size={13} /> Delete page</button>
        </div>
      )}
    </div>
  )
}
