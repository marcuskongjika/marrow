import { useEffect, useRef, type JSX, type KeyboardEvent } from 'react'
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from './Icons'
import styles from './FindBar.module.css'

export interface FindBarProps {
  query: string
  matchCase: boolean
  matches: number
  activeIndex: number
  onQueryChange: (query: string) => void
  onToggleMatchCase: () => void
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
}

export function FindBar({
  query,
  matchCase,
  matches,
  activeIndex,
  onQueryChange,
  onToggleMatchCase,
  onNext,
  onPrevious,
  onClose
}: FindBarProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) onPrevious()
      else onNext()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  const counter =
    query === '' ? '' : matches === 0 ? 'No matches' : `${activeIndex + 1} of ${matches}`

  return (
    <div className={styles.bar} role="search" data-print-hide="">
      <input
        ref={inputRef}
        className={styles.input}
        data-testid="find-input"
        type="text"
        value={query}
        spellCheck={false}
        placeholder="Find in document"
        aria-label="Find in document"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      <span
        className={styles.counter}
        data-testid="find-count"
        data-empty={query !== '' && matches === 0 ? 'true' : undefined}
        aria-live="polite"
      >
        {counter}
      </span>

      <button
        type="button"
        className={styles.toggle}
        data-on={matchCase ? 'true' : undefined}
        onClick={onToggleMatchCase}
        title="Match case"
        aria-pressed={matchCase}
      >
        Aa
      </button>

      <div className={styles.divider} />

      <button
        type="button"
        className={styles.step}
        onClick={onPrevious}
        disabled={matches === 0}
        title="Previous match (Shift+Enter)"
        aria-label="Previous match"
      >
        <ChevronUpIcon size={14} />
      </button>
      <button
        type="button"
        className={styles.step}
        onClick={onNext}
        disabled={matches === 0}
        title="Next match (Enter)"
        aria-label="Next match"
      >
        <ChevronDownIcon size={14} />
      </button>
      <button
        type="button"
        className={styles.step}
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close find bar"
      >
        <CloseIcon size={13} />
      </button>
    </div>
  )
}
