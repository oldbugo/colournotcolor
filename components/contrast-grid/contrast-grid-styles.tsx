"use client"

/**
 * Inline keyframes + scrollbar styling for the ContrastGrid root container.
 *
 * The slideLeft/slideRight/slideUp/slideDown keyframes are parameterised by
 * the card-plus-gap distance because they animate one card-width worth of
 * translation when rows/columns slide into place after a reorder.
 */
export function ContrastGridStyles({ cardWithGap }: { cardWithGap: number }) {
  return (
    <style jsx>{`
      @keyframes zoomOut {
        from {
          transform: scale(1.15);
          opacity: 0.8;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
      @keyframes slideLeft {
        from {
          transform: translateX(${cardWithGap}px);
        }
        to {
          transform: translateX(0);
        }
      }
      @keyframes slideRight {
        from {
          transform: translateX(-${cardWithGap}px);
        }
        to {
          transform: translateX(0);
        }
      }
      @keyframes slideUp {
        from {
          transform: translateY(${cardWithGap}px);
        }
        to {
          transform: translateY(0);
        }
      }
      @keyframes slideDown {
        from {
          transform: translateY(-${cardWithGap}px);
        }
        to {
          transform: translateY(0);
        }
      }
      :global(.contrast-scroll-area) {
        scrollbar-width: thick;
        scrollbar-color: rgba(79, 79, 79, 0.7) rgba(0, 0, 0, 0.12);
      }
      :global(.contrast-scroll-area::-webkit-scrollbar) {
        width: 16px;
        height: 16px;
      }
      :global(.contrast-scroll-area::-webkit-scrollbar-track) {
        background-color: rgba(0, 0, 0, 0.12);
        border-radius: 999px;
      }
      :global(.contrast-scroll-area::-webkit-scrollbar-thumb) {
        background-color: rgba(79, 79, 79, 0.7);
        border-radius: 999px;
        border: 4px solid rgba(0, 0, 0, 0);
        background-clip: content-box;
      }
      :global(.contrast-scroll-area:hover::-webkit-scrollbar-thumb) {
        background-color: rgba(55, 55, 55, 0.85);
      }
    `}</style>
  )
}
