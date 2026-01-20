export type StatusPillSize = "sm" | "md"
export type StatusPillTone = "pass" | "fail" | "neutral"

const STATUS_PILL_BASE =
  "inline-flex items-center justify-center rounded-[10px] font-semibold uppercase tracking-wide"

const STATUS_PILL_SIZES: Record<StatusPillSize, string> = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-3 py-1 text-xs",
}

const STATUS_PILL_TONES: Record<StatusPillTone, string> = {
  pass: "bg-emerald-400 text-emerald-950/90",
  fail: "bg-red-400 text-red-950/90",
  neutral: "bg-muted text-muted-foreground",
}

export const getStatusPillClassName = (tone: StatusPillTone, size: StatusPillSize) =>
  `${STATUS_PILL_BASE} ${STATUS_PILL_SIZES[size]} ${STATUS_PILL_TONES[tone]}`

export const getStatusPillBaseClassName = (size: StatusPillSize) =>
  `${STATUS_PILL_BASE} ${STATUS_PILL_SIZES[size]}`

export const getStatusPillTone = (value?: boolean): StatusPillTone => {
  if (value === true) return "pass"
  if (value === false) return "fail"
  return "neutral"
}
