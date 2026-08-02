/** Connection codes for using RoleReady inside Claude.
 *
 * A code is generated HERE, in the browser. Only its SHA-256 hash is stored in
 * Supabase — the same reason passwords are hashed: if that table ever leaked,
 * the rows could not be turned back into working codes. The plaintext is shown
 * to the user once and never reaches the server.
 *
 * The MCP server receives the code as `Authorization: Bearer <code>`, hashes it
 * the same way, and matches it to find whose saved API keys to use.
 */

import { supabase } from "./supabase"

export interface McpToken {
  id: string
  token_prefix: string
  label: string | null
  created_at: string
  last_used_at: string | null
}

/** The deployed MCP endpoint users connect Claude to. */
export const MCP_URL =
  (import.meta.env.VITE_MCP_URL as string | undefined) ??
  "https://roleready-api.vercel.app/mcp"

function randomCode(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `rr_live_${b64}`
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/** The one-line command a user pastes into their terminal. */
export function connectCommand(code: string): string {
  return `claude mcp add --transport http roleready ${MCP_URL} --header "Authorization: Bearer ${code}"`
}

/** Codes belonging to the signed-in user. RLS scopes this to them. */
export async function listTokens(): Promise<McpToken[]> {
  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("id, token_prefix, label, created_at, last_used_at")
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

/** Create a code and return the PLAINTEXT — the only time it exists.
 *  Store it nowhere; show it once and let the user copy it. */
export async function createToken(userId: string, label: string): Promise<string> {
  const code = randomCode()
  const { error } = await supabase.from("mcp_tokens").insert({
    user_id: userId,
    token_hash: await sha256Hex(code),
    // Enough to recognise a code in the list, too little to reconstruct it.
    token_prefix: code.slice(0, 12),
    label: label.trim() || null,
  })
  if (error) throw new Error(`Could not create a connection code: ${error.message}`)
  return code
}

/** Revoke a code. It stops working immediately; other codes are unaffected. */
export async function revokeToken(id: string): Promise<void> {
  const { error } = await supabase.from("mcp_tokens").delete().eq("id", id)
  if (error) throw new Error(`Could not revoke that code: ${error.message}`)
}
