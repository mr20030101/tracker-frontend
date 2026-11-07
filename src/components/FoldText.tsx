import type { CSSProperties, ReactNode } from 'react'

// After this many letters the rest unfold together, so a long name doesn't keep the title moving.
const MAX_STAGGER = 24

/**
 * Unfolds a title letter by letter, each one swinging down from a hinge along its top edge with a
 * crease shadow that fades as it opens (a CSS port of React Bits' Fold Text, paper style).
 * Plays once whenever the title mounts. Anything that isn't plain text renders unchanged.
 */
export function FoldText({ text }: { text: ReactNode }) {
  if (typeof text !== 'string' || !text.trim()) return <>{text}</>
  let index = 0
  return (
    <span className="fold-text">
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(/(\s+)/).map((part, partIndex) =>
          /^\s*$/.test(part) ? (
            part
          ) : (
            <span key={partIndex} className="fold-word">
              {Array.from(part).map((char, charIndex) => (
                <span
                  key={charIndex}
                  className="fold-char"
                  data-char={char}
                  style={{ '--fold-i': Math.min(index++, MAX_STAGGER) } as CSSProperties}
                >
                  {char}
                </span>
              ))}
            </span>
          ),
        )}
      </span>
    </span>
  )
}
