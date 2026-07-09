import { createClient } from "@supabase/supabase-js"

// These are PUBLIC by design — the anon key ships in the browser bundle for
// every visitor, and Supabase security is enforced by row-level rules, not by
// hiding this key. Hardcoded so a mistyped env var can't break auth; an env
// var (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) overrides only if it looks valid.
const FALLBACK_URL = "https://qdlhkblttmlcgogguemj.supabase.co"
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFkbGhrYmx0dG1sY2dvZ2d1ZW1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NjYxNDYsImV4cCI6MjA5OTA0MjE0Nn0.juvxAWREXUnlsDwwCnPCIUALhk7rwYsaNc1XGM1xRVk"

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// A valid Supabase key is a JWT: three dot-separated base64url segments.
const isValidJwt = (k?: string) => !!k && k.split(".").length === 3 && k.startsWith("eyJ")

export const supabase = createClient(
  envUrl && envUrl.startsWith("https://") ? envUrl : FALLBACK_URL,
  isValidJwt(envKey) ? (envKey as string) : FALLBACK_ANON_KEY
)
