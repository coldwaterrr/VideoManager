import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'

export function useDialogFocus(
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  busy = false,
  active = true,
  identity = ''
) {
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  closeRef.current = onClose
  busyRef.current = busy
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    const first =
      panel.current?.querySelector<HTMLElement>(
        'input:not(:disabled), textarea:not(:disabled), select:not(:disabled)'
      ) || panel.current?.querySelector<HTMLElement>('button:not(:disabled)')
    ;(first || panel.current)?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault()
        event.stopPropagation()
        closeRef.current()
      }
      if (event.key !== 'Tab') return
      const controls = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
        ) || []
      ).filter((element) => element.getClientRects().length > 0)
      const first = controls[0],
        last = controls[controls.length - 1]
      if (!first) {
        event.preventDefault()
        panel.current?.focus()
        return
      }
      if (!panel.current?.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel.current)
      ) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown, true)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', keydown, true)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [active, identity, panel])
}

export function Dialog({
  title,
  description,
  onClose,
  children,
  busy = false,
  wide = false,
  className = '',
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  busy?: boolean
  wide?: boolean
  className?: string
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panel = useRef<HTMLElement>(null)
  useDialogFocus(panel, onClose, busy)
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section
        ref={panel}
        tabIndex={-1}
        className={`dialog-panel ${wide ? 'dialog-wide' : ''} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header className="dialog-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`关闭${title}`}
            title={`关闭${title}`}
            onClick={onClose}
            disabled={busy}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
