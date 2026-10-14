import type { JSX } from 'react'
import type { ToastsApi } from '../hooks/useToasts'
import { AlertIcon, CheckIcon, CloseIcon } from './Icons'
import styles from './Toasts.module.css'

export function Toasts({ toasts, dismiss }: ToastsApi): JSX.Element | null {
  if (toasts.length === 0) return null

  return (
    <div className={styles.stack} role="status" aria-live="polite" data-print-hide="">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast} data-kind={toast.kind}>
          <span className={styles.icon}>
            {toast.kind === 'error' ? <AlertIcon size={14} /> : <CheckIcon size={14} />}
          </span>
          <div className={styles.body}>
            <p className={styles.message}>{toast.message}</p>
            {toast.detail && <p className={styles.detail}>{toast.detail}</p>}
          </div>
          {toast.action && (
            <button type="button" className={styles.action} onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className={styles.close}
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
          >
            <CloseIcon size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}
