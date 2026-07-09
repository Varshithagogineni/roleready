/** Supabase database helpers for user profiles + application history.
 *
 * RLS is disabled on these tables, so the logged-in anon session can
 * read/write. Rows are keyed by the user's Google email.
 */

import { supabase } from "./supabase"

export interface Profile {
  email: string
  first_name: string
  last_name: string
  phone: string
  target_roles: string[]
  created_at?: string
}

export interface ApplicationRow {
  id?: number
  email: string
  company: string
  role: string
  fit_score: number | null
  created_at?: string
}

/** Returns the profile for this email, or null if they haven't onboarded yet. */
export async function getProfile(email: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", email)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Profile | null
}

/** Insert or update a profile (keyed by email). */
export async function upsertProfile(profile: Profile): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "email" })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Profile
}

/** Save one application to the history. Best-effort — never blocks the UI. */
export async function saveApplication(row: ApplicationRow): Promise<void> {
  const { error } = await supabase.from("applications").insert(row)
  if (error) console.warn("Could not save application:", error.message)
}

/** Most recent applications for this user (newest first). */
export async function getApplications(email: string): Promise<ApplicationRow[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []) as ApplicationRow[]
}
