import { useEffect, useState } from "react"

/** Circular fit-score gauge with color coding (green ≥75, amber ≥50, red below). */

export function scoreColor(score: number): string {
  if (score >= 75) return "#10b981" // emerald-500
  if (score >= 50) return "#f59e0b" // amber-500
  return "#ef4444" // red-500
}

export function scoreLabel(score: number): string {
  if (score >= 75) return "Strong fit"
  if (score >= 50) return "Moderate fit"
  return "Needs work"
}

interface Props {
  score: number
  size?: number
}

export function ScoreRing({ score, size = 132 }: Props) {
  const stroke = 10
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  const color = scoreColor(clamped)

  // Count the number up from 0 alongside the ring sweep.
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const duration = 800
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setShown(Math.round(eased * clamped))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [clamped])

  const offset = circumference * (1 - shown / 100)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color }}>
          {shown}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  )
}
