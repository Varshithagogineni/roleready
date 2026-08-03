/** Recognising which MCP client a connection code is being used from.
 *
 * We only get the User-Agent to work with. The protocol's own clientInfo is
 * sent with `initialize` only, and our server runs stateless, so it is null by
 * the time a tool is called — verified, not assumed.
 *
 * Known User-Agents:
 *   Claude Code → "claude-code/2.1.220 (sdk-cli)"   (captured from a real run)
 * The others are matched on the obvious substring of their name. Because the
 * raw User-Agent is stored, anything unrecognised still shows up with its real
 * name and can be promoted to a proper entry here later.
 */

import type { ReactNode } from "react"

export interface ClientBadge {
  id: string
  name: string
  /** Brand tint used for the badge tile. */
  color: string
  mark: ReactNode
}

/** Claude's sunburst, drawn inline so it costs no network request.
 *  Used to signal "works with Claude" — not an endorsement. */
export function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      {Array.from({ length: 12 }).map((_, i) => (
        <rect
          key={i}
          x="11.15"
          y="2.1"
          width="1.7"
          height="8.1"
          rx="0.85"
          transform={`rotate(${i * 30} 12 12)`}
        />
      ))}
    </svg>
  )
}

function Monogram({ text }: { text: string }) {
  return (
    <span className="text-[10px] leading-none font-bold tracking-tight">{text}</span>
  )
}

function TerminalMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 8 4 4-4 4" />
      <path d="M13 16h6" />
    </svg>
  )
}

const KNOWN: { match: RegExp; badge: ClientBadge }[] = [
  {
    match: /claude[-_ ]?code/i,
    badge: {
      id: "claude-code",
      name: "Claude Code",
      color: "#D97757",
      mark: <ClaudeMark className="size-4" />,
    },
  },
  {
    match: /claude/i,
    badge: {
      id: "claude",
      name: "Claude",
      color: "#D97757",
      mark: <ClaudeMark className="size-4" />,
    },
  },
  {
    match: /codex/i,
    badge: {
      id: "codex",
      name: "Codex",
      color: "#10A37F",
      mark: <Monogram text="Cx" />,
    },
  },
  {
    match: /opencode/i,
    badge: {
      id: "opencode",
      name: "OpenCode",
      color: "#6366F1",
      mark: <Monogram text="OC" />,
    },
  },
  {
    match: /cursor/i,
    badge: {
      id: "cursor",
      name: "Cursor",
      color: "#0EA5E9",
      mark: <Monogram text="Cu" />,
    },
  },
  {
    match: /windsurf/i,
    badge: {
      id: "windsurf",
      name: "Windsurf",
      color: "#22C55E",
      mark: <Monogram text="Ws" />,
    },
  },
]

/** Tidy a raw User-Agent into something worth showing: "foo-bar/1.2 (x)" → "foo-bar". */
function prettifyUa(ua: string): string {
  const head = ua.split("/")[0].trim()
  return head.length > 1 && head.length <= 24 ? head : "Unknown client"
}

/** Identify the client from its User-Agent. `null` UA means never used yet. */
export function identifyClient(ua: string | null): ClientBadge | null {
  if (!ua) return null
  const hit = KNOWN.find((k) => k.match.test(ua))
  if (hit) return hit.badge
  return {
    id: "unknown",
    name: prettifyUa(ua),
    color: "#71717A",
    mark: <TerminalMark className="size-4" />,
  }
}
