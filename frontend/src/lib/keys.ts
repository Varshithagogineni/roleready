/** Bring-your-own-API-key storage.
 *
 * Keys are saved per signed-in user in Supabase (`user_api_keys`, RLS-protected
 * so a row is readable only by its owner). They used to live only in
 * localStorage, which meant they were trapped in one browser — the RoleReady
 * MCP server runs server-side and could never see them. Storing them against
 * the user's Supabase identity lets the web app and the MCP server share the
 * same keys: sign in once, paste keys once.
 *
 * localStorage is still used, but only as a synchronous cache so request
 * headers can be built without awaiting a round-trip on every call.
 */

import { supabase } from "./supabase"

const GEMINI_KEY_STORAGE = "roleready.geminiKey"
const TAVILY_KEY_STORAGE = "roleready.tavilyKey"

export interface ApiKeys {
  gemini: string
  tavily: string
}

/** Synchronous local cache of the keys. Mirrors what's in Supabase. */
export const keyCache = {
  get: (): ApiKeys => ({
    gemini: localStorage.getItem(GEMINI_KEY_STORAGE) ?? "",
    tavily: localStorage.getItem(TAVILY_KEY_STORAGE) ?? "",
  }),
  set({ gemini, tavily }: ApiKeys) {
    gemini.trim()
      ? localStorage.setItem(GEMINI_KEY_STORAGE, gemini.trim())
      : localStorage.removeItem(GEMINI_KEY_STORAGE)
    tavily.trim()
      ? localStorage.setItem(TAVILY_KEY_STORAGE, tavily.trim())
      : localStorage.removeItem(TAVILY_KEY_STORAGE)
  },
  clear() {
    localStorage.removeItem(GEMINI_KEY_STORAGE)
    localStorage.removeItem(TAVILY_KEY_STORAGE)
  },
  hasAny: () =>
    Boolean(
      localStorage.getItem(GEMINI_KEY_STORAGE) || localStorage.getItem(TAVILY_KEY_STORAGE)
    ),
}

/** Load this user's saved keys from Supabase and warm the local cache.
 *  RLS scopes the query to the caller, so no user_id filter is needed.
 *  Falls back to whatever is cached locally if the fetch fails. */
export async function loadKeys(): Promise<ApiKeys> {
  const { data, error } = await supabase
    .from("user_api_keys")
    .select("gemini_key, tavily_key")
    .maybeSingle()

  if (error || !data) return keyCache.get()

  const keys: ApiKeys = {
    gemini: data.gemini_key ?? "",
    tavily: data.tavily_key ?? "",
  }
  keyCache.set(keys)
  return keys
}

/** Persist keys for the signed-in user, in Supabase and the local cache. */
export async function saveKeys(userId: string, keys: ApiKeys): Promise<void> {
  keyCache.set(keys)

  const { error } = await supabase.from("user_api_keys").upsert({
    user_id: userId,
    gemini_key: keys.gemini.trim() || null,
    tavily_key: keys.tavily.trim() || null,
  })

  if (error) throw new Error(`Could not save your keys: ${error.message}`)
}
