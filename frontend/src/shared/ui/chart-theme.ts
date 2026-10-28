/** Shared chart chrome so every Recharts chart reads as one system (hairline grid, muted axes). */
export const axisProps = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--subtle-foreground)', fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: 'var(--axis)' },
} as const

export const gridProps = { stroke: 'var(--grid)', strokeDasharray: undefined, vertical: false } as const
