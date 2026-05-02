import { useCallback, useEffect, useState, type RefObject } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { copilotPillInteractiveClassName } from './novelCopilotChrome'

export function CopilotScrollNav({ containerRef }: { containerRef: RefObject<HTMLDivElement | null> }) {
  const [showButtons, setShowButtons] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const update = () => {
      const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      setShowButtons(distanceToBottom > 100 || container.scrollTop > 100)
    }

    update()
    container.addEventListener('scroll', update)
    return () => container.removeEventListener('scroll', update)
  }, [containerRef])

  const getAnchors = useCallback(() => {
    return containerRef.current
      ? Array.from(containerRef.current.querySelectorAll<HTMLElement>('[data-run-anchor]'))
      : []
  }, [containerRef])

  const scrollToAnchor = useCallback(
    (direction: 'up' | 'down') => {
      const container = containerRef.current
      if (!container) return
      const anchors = getAnchors()
      if (anchors.length === 0) {
        container.scrollTo({ top: direction === 'up' ? 0 : container.scrollHeight, behavior: 'smooth' })
        return
      }

      const containerRect = container.getBoundingClientRect()
      const relativeTop = (el: Element) =>
        container.scrollTop + el.getBoundingClientRect().top - containerRect.top

      const midY = container.scrollTop + container.clientHeight / 2
      let target: HTMLElement | null = null

      if (direction === 'up') {
        for (let i = anchors.length - 1; i >= 0; i--) {
          if (relativeTop(anchors[i]) < midY - 20) { target = anchors[i]; break }
        }
      } else {
        for (let i = 0; i < anchors.length; i++) {
          if (relativeTop(anchors[i]) > midY + 20) { target = anchors[i]; break }
        }
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        container.scrollTo({ top: direction === 'up' ? 0 : container.scrollHeight, behavior: 'smooth' })
      }
    },
    [containerRef, getAnchors],
  )

  if (!showButtons) return null

  return (
    <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex flex-col gap-2">
      <button
        type="button"
        className={cn('pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full', copilotPillInteractiveClassName)}
        onClick={() => scrollToAnchor('up')}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={cn('pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full', copilotPillInteractiveClassName)}
        onClick={() => scrollToAnchor('down')}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  )
}
