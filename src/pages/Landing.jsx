import React from 'react'
import { Link } from 'react-router-dom'
import {
  FileText, Edit3, Scissors, Merge, ScanLine, Zap,
  Lock, Globe, ChevronRight, Check, X, Github,
  Image, PenTool, RotateCcw, FileDown,
  Eye, Droplets, FileSearch
} from 'lucide-react'
import Navbar from '../components/layout/Navbar.jsx'
import styles from './Landing.module.css'

const FEATURES = [
  { icon: Edit3, label: 'Edit existing text', desc: 'Click any text in a PDF. Edit in-place with automatic font detection. Change size, color, or font.', tag: 'Killer feature' },
  { icon: ScanLine, label: 'OCR scanner', desc: 'Make scanned and image PDFs searchable and editable with Tesseract.js - runs 100% offline.', tag: 'AI-powered' },
  { icon: Merge, label: 'Merge PDFs', desc: 'Drag and drop to combine multiple PDFs with full page-order control.' },
  { icon: Scissors, label: 'Split PDF', desc: 'Split by page ranges, every N pages, or extract individual pages.' },
  { icon: Image, label: 'Edit images', desc: 'Add, remove, replace, or reposition images anywhere in a PDF.' },
  { icon: PenTool, label: 'e-Sign', desc: 'Draw, type, or upload your signature. Apply it to any page with no extra account needed.' },
  { icon: FileDown, label: 'Compress', desc: 'Reduce PDF file size by up to 80% using browser-native object stream compression.' },
  { icon: RotateCcw, label: 'Rotate and reorder', desc: 'Rotate individual pages and drag them into the right order visually.' },
  { icon: Lock, label: 'Password protect', desc: 'Add 256-bit AES encryption or remove existing passwords.' },
  { icon: Eye, label: 'Redact', desc: 'Permanently black out sensitive content, including text and images.' },
  { icon: Droplets, label: 'Watermark', desc: 'Add custom text or image watermarks with full opacity and rotation control.' },
  { icon: FileSearch, label: 'Form filler', desc: 'Fill, flatten, and export any PDF form instantly.' },
]

const COMPARE = [
  { feature: 'Edit existing PDF text', df: true, others: 'often paid or limited' },
  { feature: 'Unlimited file size', df: true, others: 'often capped' },
  { feature: 'Unlimited tasks/day', df: true, others: 'free plans may stop after a few tasks' },
  { feature: 'Works offline', df: true, others: 'usually browser or cloud-based' },
  { feature: 'No account required', df: true, others: 'sometimes' },
  { feature: 'Files never uploaded', df: true, others: 'not always' },
  { feature: 'OCR scanner', df: true, others: 'often paid' },
  { feature: 'e-Sign PDFs', df: true, others: 'often paid' },
  { feature: 'Open source (MIT)', df: true, others: 'rare' },
  { feature: 'free', df: true, others: 'many free plans have limits' },
]

function Cell({ val }) {
  if (val === true) return <span className={styles.yes}><Check size={14} /></span>
  if (val === false) return <span className={styles.no}><X size={14} /></span>
  return <span className={styles.partial}>{val}</span>
}

export default function Landing() {
  return (
    <div className={styles.page}>
      <Navbar variant="landing" />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrow}>
            <Globe size={12} /> Open source - MIT license - No backend
          </div>
          <h1 className={styles.heroTitle}>
            The PDF editor<br />
            <span className={styles.heroAccent}>students actually need</span>
          </h1>
          <p className={styles.heroSub}>
            Many PDF tools charge a few dollars a month or limit how much you can do for free.
            <em> PDFZero gives you text editing, OCR, signing, merging, and more at no cost</em>,
            with your files never leaving your device.
          </p>
          <div className={styles.heroActions}>
            <Link to="/editor" className={styles.primaryBtn}>
              <Zap size={16} />
              Start editing free
              <ChevronRight size={14} />
            </Link>
            <a href="https://github.com/bevinkatti/pdfzero" target="_blank" rel="noopener noreferrer" className={styles.ghostBtn}>
              <Github size={15} />
              Star on GitHub
            </a>
          </div>
          <div className={styles.heroPills}>
            <span className={styles.pill}><Check size={11} /> No sign-up</span>
            <span className={styles.pill}><Check size={11} /> No file size limit</span>
            <span className={styles.pill}><Check size={11} /> No task limits</span>
            <span className={styles.pill}><Check size={11} /> Works offline</span>
            <span className={styles.pillAccent}><Lock size={11} /> Files never uploaded</span>
          </div>
        </div>

        <div className={styles.heroVisual}>
          <div className={styles.editorPreview}>
            <div className={styles.previewBar}>
              <div className={styles.previewDots}>
                <span /><span /><span />
              </div>
              <span className={styles.previewTitle}>annual-report.pdf - PDFZero</span>
            </div>
            <div className={styles.previewContent}>
              <div className={styles.previewToolbar}>
                {['T', 'B', 'I', '|', '12', '|', 'Helvetica'].map((t, i) => (
                  <span key={i} className={t === '|' ? styles.sep : styles.tbItem}>{t}</span>
                ))}
              </div>
              <div className={styles.previewPage}>
                <div className={styles.previewSelectedBlock}>
                  Annual Report 2026
                  <div className={styles.selHandle} />
                </div>
                <div className={styles.previewTextLine} style={{ width: '90%', marginTop: 28 }} />
                <div className={styles.previewTextLine} style={{ width: '75%', marginTop: 8 }} />
                <div className={styles.previewTextLine} style={{ width: '82%', marginTop: 8 }} />
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <div className={styles.previewCard} style={{ background: 'rgba(59,130,246,0.15)' }}>
                    <span style={{ fontSize: 10, color: '#60a5fa' }}>Revenue</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: '#93c5fd' }}>$4.2M</span>
                  </div>
                  <div className={styles.previewCard} style={{ background: 'rgba(16,185,129,0.15)' }}>
                    <span style={{ fontSize: 10, color: '#34d399' }}>Profit</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: '#6ee7b7' }}>$840K</span>
                  </div>
                </div>
                <div className={styles.previewCtx}>
                  <span>B</span><span>I</span><span>Img</span><span>Link</span><span style={{ color: '#e84545' }}>Del</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Everything you need</div>
          <h2 className={styles.sectionTitle}>All the tools. Free.</h2>
          <p className={styles.sectionSub}>The core PDF tools people usually pay for, all in one free offline app.</p>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => {
              const Icon = f.icon
              return (
                <div key={f.label} className={styles.featureCard}>
                  <div className={styles.featureIconWrap}>
                    <Icon size={20} />
                  </div>
                  <div className={styles.featureLabel}>
                    {f.label}
                    {f.tag && <span className={styles.featureTag}>{f.tag}</span>}
                  </div>
                  <div className={styles.featureDesc}>{f.desc}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <section className={styles.section} style={{ background: 'var(--bg-nav)' }}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Comparison</div>
          <h2 className={styles.sectionTitle}>PDFZero vs other PDF tools</h2>
          <div className={styles.tableWrap}>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className={styles.thDocforge}>
                    <div className={styles.thBadge}>PDFZero</div>
                    <div className={styles.thPrice}>Free</div>
                  </th>
                  <th>
                    <div>Other tools</div>
                    <div className={styles.thPrice}>Often paid or limited on free plans</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature}>
                    <td>{row.feature}</td>
                    <td className={styles.tdDocforge}><Cell val={row.df} /></td>
                    <td><Cell val={row.others} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionLabel}>Privacy first</div>
          <h2 className={styles.sectionTitle}>Your files never leave your device</h2>
          <div className={styles.howGrid}>
            <div className={styles.howCard}>
              <div className={styles.howNum}>01</div>
              <div className={styles.howTitle}>Open your PDF</div>
              <div className={styles.howDesc}>Drag and drop or click to browse. The file is loaded directly into your browser memory.</div>
            </div>
            <div className={styles.howCard}>
              <div className={styles.howNum}>02</div>
              <div className={styles.howTitle}>Edit everything</div>
              <div className={styles.howDesc}>All processing uses pdf-lib and PDF.js running locally in WebAssembly. Zero network requests.</div>
            </div>
            <div className={styles.howCard}>
              <div className={styles.howNum}>03</div>
              <div className={styles.howTitle}>Download instantly</div>
              <div className={styles.howDesc}>Your edited PDF is generated in-browser and downloaded directly. No cloud, no server, no tracking.</div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.ctaSection}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaTitle}>Ready to ditch the paywalls?</h2>
          <p className={styles.ctaSub}>No account. No credit card. No upload. Just open a PDF and start editing.</p>
          <div className={styles.ctaActions}>
            <Link to="/editor" className={styles.primaryBtn} style={{ fontSize: 15, padding: '12px 28px' }}>
              <Zap size={16} />
              Open the editor
            </Link>
            <Link to="/tools" className={styles.ghostBtn}>
              Browse all tools
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <div className={styles.footerLogoMark}><FileText size={14} /></div>
            <span>PDFZero</span>
          </div>
          <div className={styles.footerLinks}>
            <a href="https://github.com/bevinkatti/pdfzero" target="_blank" rel="noopener noreferrer">GitHub</a>
            <Link to="/tools">All Tools</Link>
            <Link to="/editor">Editor</Link>
            <a href="https://github.com/bevinkatti/pdfzero/issues" target="_blank" rel="noopener noreferrer">Report Bug</a>
          </div>
          <div className={styles.footerNote}>
            MIT License - Built with pdf-lib, PDF.js, Tesseract.js - No tracking, no analytics
          </div>
        </div>
      </footer>
    </div>
  )
}
