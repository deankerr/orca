/** One label and value in the panel. */
export interface FactRow {
  /** Stable React key within a section. */
  id: string
  label: string
  value: string
  /** Hover text. Backticks mark code. */
  description?: string
  /** Renders the value as an external link. */
  href?: string
  /** A detail of the row above it, set in from the label. */
  indent?: boolean
  /** A price. It never breaks across lines, and drops under a label too long to share a line. */
  rate?: boolean
  /** Reads in the foreground colour rather than muted, for detail beside the plain rates. */
  emphasis?: boolean
}

export interface Section {
  id: string
  title: string
  /** Shown on the right of the title: units or the statistic. */
  note?: string
  rows: FactRow[]
}
