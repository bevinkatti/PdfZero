import React, { useEffect, useCallback, useState } from 'react'
import toast from 'react-hot-toast'
import { usePdfStore } from '../store/pdfStore.js'
import { loadPdf } from '../lib/pdfRenderer.js'
import Navbar from '../components/layout/Navbar.jsx'
import EditorToolbar from '../components/editor/EditorToolbar.jsx'
import PageThumbnails from '../components/editor/PageThumbnails.jsx'
import PdfCanvas from '../components/editor/PdfCanvas.jsx'
import PropertiesPanel from '../components/editor/PropertiesPanel.jsx'
import DropZone from '../components/ui/DropZone.jsx'
import styles from './Editor.module.css'

export default function Editor() {
  const { file, setPageCount, fileName, zoom, currentPage, setCurrentPage, pageCount } = usePdfStore()
  // pdfReady gates PdfCanvas — only render after loadPdf() fully resolves
  const [pdfReady, setPdfReady] = useState(false)

  useEffect(() => {
    if (!file) { setPdfReady(false); return }
    setPdfReady(false)  // reset so PdfCanvas remounts cleanly

    loadPdf(file)
      .then((doc) => {
        setPageCount(doc.numPages)
        // Small rAF delay so React can flush the pageCount state
        // before PdfCanvas triggers its first renderPage()
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPdfReady(true))
        })
        toast.success(`Loaded ${doc.numPages} page${doc.numPages > 1 ? 's' : ''}`)
      })
      .catch((e) => toast.error('Failed to parse PDF: ' + e.message))
  }, [file, setPageCount])

  const handleKeyDown = useCallback((e) => {
    // Don't steal keys while user is typing in a text block
    if (e.target.isContentEditable) return

    // Page navigation
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (currentPage < pageCount) setCurrentPage(currentPage + 1)
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (currentPage > 1) setCurrentPage(currentPage - 1)
    }
  }, [currentPage, pageCount, setCurrentPage])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className={styles.page}>
      <Navbar variant="app" />
      <EditorToolbar />

      <div className={styles.workspace}>
        {file ? (
          <>
            <aside className={styles.leftPanel}>
              <PageThumbnails />
            </aside>

            <main className={styles.canvas}>
              {/* Only mount PdfCanvas after loadPdf() has resolved */}
              {pdfReady && <PdfCanvas />}
              {!pdfReady && (
                <div className={styles.loadingCanvas}>
                  <div className={styles.loadingSpinner} />
                  <span>Loading PDF…</span>
                </div>
              )}
            </main>

            <aside className={styles.rightPanel}>
              <PropertiesPanel />
            </aside>
          </>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyContent}>
              <h2 className={styles.emptyTitle}>Open a PDF to start editing</h2>
              <p className={styles.emptySub}>
                Files are processed entirely in your browser — never uploaded anywhere.
              </p>
              <DropZone />
            </div>
          </div>
        )}
      </div>

      {file && (
        <div className={styles.statusBar}>
          <span className={styles.statusFile}>📄 {fileName}</span>
          <span className={styles.statusCenter}>Page {currentPage} of {pageCount}</span>
          <span className={styles.statusRight}>
            <span className={styles.privacyDot} />
            Processed locally — never uploaded
          </span>
        </div>
      )}
    </div>
  )
}
