import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Upload, FileText, AlertCircle } from 'lucide-react'
import { usePdfStore } from '../../store/pdfStore.js'
import styles from './DropZone.module.css'

export default function DropZone({ compact = false }) {
  const navigate = useNavigate()
  const { setFile } = usePdfStore()

  const onDrop = useCallback(async (accepted, rejected) => {
    if (rejected.length > 0) {
      toast.error('Only PDF files are supported')
      return
    }
    if (accepted.length === 0) return

    const file = accepted[0]
    const arrayBuffer = await file.arrayBuffer()
    setFile(arrayBuffer, file.name, file.size)
    toast.success(`Loaded ${file.name}`)
    navigate('/editor')
  }, [setFile, navigate])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  })

  if (compact) {
    return (
      <div {...getRootProps()} className={`${styles.compact} ${isDragActive ? styles.dragging : ''}`}>
        <input {...getInputProps()} />
        <Upload size={16} />
        <span>Open PDF</span>
      </div>
    )
  }

  return (
    <div {...getRootProps()} className={`${styles.zone} ${isDragActive ? styles.dragging : ''}`}>
      <input {...getInputProps()} />
      <div className={styles.icon}>
        {isDragActive ? <FileText size={36} /> : <Upload size={36} />}
      </div>
      <div className={styles.title}>
        {isDragActive ? 'Drop to open' : 'Drop your PDF here'}
      </div>
      <div className={styles.sub}>
        or <span className={styles.browse}>click to browse</span>
      </div>
      <div className={styles.note}>
        <AlertCircle size={12} />
        Files are processed entirely in your browser — never uploaded anywhere
      </div>
      <div className={styles.formats}>
        <span>PDF</span>
        <span>Scanned PDF</span>
        <span>PDF/A</span>
        <span>PDF forms</span>
      </div>
    </div>
  )
}
