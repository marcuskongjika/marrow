import { useCallback, useEffect, useRef, useState } from 'react'

export type ToastKind = 'info' | 'error' | 'success'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  detail?: string
  action?: { label: string; run: () => void }
}

export interface ToastsApi {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>) => void
  dismiss: (id: number) => void
}

let nextId = 1

/** Transient notices: open failures, export results. At most four at a time. */
export function useToasts(): ToastsApi {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId++
      setToasts((current) => [...current.slice(-3), { ...toast, id }])
      const timer = window.setTimeout(() => dismiss(id), toast.kind === 'error' ? 8000 : 4000)
      timers.current.set(id, timer)
    },
    [dismiss]
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
    }
  }, [])

  return { toasts, push, dismiss }
}
