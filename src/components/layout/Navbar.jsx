import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { FileText, Github, Star, Zap } from 'lucide-react'
import styles from './Navbar.module.css'

export default function Navbar({ variant = 'app' }) {
  const location = useLocation()

  return (
    <nav className={`${styles.nav} ${variant === 'landing' ? styles.landing : ''}`}>
      <div className={styles.left}>
        <Link to="/" className={styles.logo}>
          <div className={styles.logoMark}>
            <FileText size={14} />
          </div>
          <span className={styles.logoName}>PDFZero</span>
          <span className={styles.logoBeta}>beta</span>
        </Link>

        {variant === 'app' && (
          <div className={styles.tabs}>
            <Link to="/editor" className={`${styles.tab} ${location.pathname === '/editor' ? styles.active : ''}`}>
              Editor
            </Link>
            <Link to="/tools" className={`${styles.tab} ${location.pathname.startsWith('/tools') ? styles.active : ''}`}>
              All Tools
            </Link>
          </div>
        )}
      </div>

      <div className={styles.right}>
        <div className={styles.privacyBadge}>
          <div className={styles.dot} />
          <span>100% local processing</span>
        </div>

        <a
          href="https://github.com/bevinkatti/pdfzero"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.githubBtn}
        >
          <Github size={14} />
          <span>GitHub</span>
          <span className={styles.starCount}>
            <Star size={11} />
            Star
          </span>
        </a>

        {variant === 'landing' && (
          <Link to="/editor" className={styles.ctaBtn}>
            <Zap size={14} />
            Start editing free
          </Link>
        )}
      </div>
    </nav>
  )
}
