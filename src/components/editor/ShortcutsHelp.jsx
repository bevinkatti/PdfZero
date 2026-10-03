import React, { useState, useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'
import styles from './ShortcutsHelp.module.css'

const SHORTCUTS = [
  { action: 'Next page',                      keys: ['→', '↓'] },
  { action: 'Previous page',                  keys: ['←', '↑'] },
  { action: 'Finish editing a text block',    keys: ['Enter'] },
  { action: 'New line inside a text block',   keys: ['Shift', 'Enter'] },
  { action: 'Cancel editing a text block',    keys: ['Esc'] },
  { action: 'Open this shortcuts list',       keys: ['?'] },
]

export default function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && open) { setOpen(false); return }
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target
      const tag = t && t.tagName
      if (t && (t.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return
      e.preventDefault()
      setOpen(o => !o)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        className={styles.helpBtn}
        onClick={() => setOpen(true)}
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
      >
        ?
      </button>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 id="shortcuts-title" className={styles.title}>
                <Keyboard size={16} /> Keyboard shortcuts
              </h2>
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <table className={styles.table}>
              <thead>
                <tr><th>Action</th><th>Shortcut</th></tr>
              </thead>
              <tbody>
                {SHORTCUTS.map(({ action, keys }) => (
                  <tr key={action}>
                    <td>{action}</td>
                    <td>
                      {keys.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className={styles.plus}>{action.startsWith('New line') ? '+' : '/'}</span>}
                          <kbd className={styles.kbd}>{k}</kbd>
                        </React.Fragment>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className={styles.doneBtn} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  )
}
