/**
 * Design tokens shared across interactive layout surfaces.
 *
 * These tokens should be the single source of truth for card sizing and rhythm
 * inside colour manager–style collections. When you need to add new sizing
 * behaviours, extend this file instead of hard-coding constants in components.
 *
 * Usage guidelines:
 * - Import the tokens you need from `@/lib/design-tokens`.
 * - Never mutate the exported arrays; copy them locally if you need to derive state.
 * - Keep any new tokens documented here so future agents (and future chat sessions)
 *   can follow the same patterns without guesswork.
 */

export type CardSizeToken = {
  id: string
  label: string
  width: number
}

/**
 * Available card sizes for grid-based collections.
 * Width values represent the ideal target width for a column before constraints
 * like minimum width or container size are applied.
 */
export const CARD_SIZE_TOKENS: CardSizeToken[] = [
  { id: "xs", label: "XS", width: 180 },
  { id: "sm", label: "S", width: 230 },
  { id: "md", label: "M", width: 280 },
  { id: "lg", label: "L", width: 330 },
]

/**
 * Minimum width allowed for a card column, regardless of the selected token.
 * Keep this aligned with the smallest entry in `CARD_SIZE_TOKENS`.
 */
export const CARD_MIN_COLUMN_WIDTH = CARD_SIZE_TOKENS[0].width

/**
 * Maximum number of columns allowed for responsive card grids.
 */
export const CARD_MAX_GRID_COLUMNS = 8

/**
 * Shared gap between cards in grid layouts (px).
 */
export const CARD_GRID_GAP = 12

/**
 * Radii tokens used by interactive controls around card selections.
 */
export const CARD_CONTROL_RADII = {
  pill: "0.75rem",
  elevated: "1rem",
}

