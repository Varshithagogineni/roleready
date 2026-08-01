/** API client for the RoleReady FastAPI backend.
 *
 * BYO keys: if the user saved their own Gemini/Tavily keys (Settings),
 * they are sent as request headers and used server-side for that request.
 * Keys are stored per-user in Supabase — see ./keys.
 */

import { keyCache } from "./keys"
import type {
  FitResult,
  PeopleResult,
  PrepSheet,
  TailoredResume,
} from "./types"

// In dev this is empty → calls hit "/api/..." and Vite proxies to :8000.
// In prod set VITE_API_BASE to the deployed backend URL (e.g. Render).
const API_BASE = import.meta.env.VITE_API_BASE ?? ""

function keyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const { gemini, tavily } = keyCache.get()
  if (gemini) headers["X-Gemini-Key"] = gemini
  if (tavily) headers["X-Tavily-Key"] = tavily
  return headers
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body.detail === "string") detail = body.detail
    } catch {
      /* keep default */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export interface JobPosting {
  company: string
  role: string
  job_description: string
}

/** Extract company/role/JD from a job-posting URL (LinkedIn, Greenhouse, etc.). */
export async function fetchJobFromUrl(url: string): Promise<JobPosting> {
  const res = await fetch(API_BASE + "/api/extract-job", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...keyHeaders() },
    body: JSON.stringify({ url }),
  })
  return parseOrThrow<JobPosting>(res)
}

export interface PrepBundle {
  prep_sheet: PrepSheet
  people: PeopleResult
}

/** Company research + people in ONE backend call (fewer Gemini requests). */
export async function fetchPrepBundle(company: string, role: string): Promise<PrepBundle> {
  const res = await fetch(API_BASE + "/api/prep-bundle", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...keyHeaders() },
    body: JSON.stringify({ company, role }),
  })
  return parseOrThrow<PrepBundle>(res)
}

export async function fetchFitScore(
  company: string,
  role: string,
  jd: string,
  resume: File
): Promise<FitResult> {
  const form = new FormData()
  form.set("company", company)
  form.set("role", role)
  form.set("jd", jd)
  form.set("resume", resume)
  const res = await fetch(API_BASE + "/api/fit-score", {
    method: "POST",
    headers: keyHeaders(),
    body: form,
  })
  return parseOrThrow<FitResult>(res)
}

export async function fetchTailoredResume(
  company: string,
  role: string,
  jd: string,
  resume: File
): Promise<TailoredResume> {
  const form = new FormData()
  form.set("company", company)
  form.set("role", role)
  form.set("jd", jd)
  form.set("resume", resume)
  const res = await fetch(API_BASE + "/api/tailor-resume", {
    method: "POST",
    headers: keyHeaders(),
    body: form,
  })
  return parseOrThrow<TailoredResume>(res)
}

export interface ChatSource {
  title: string
  url: string
}
export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}
export interface ChatReply {
  answer: string
  sources: ChatSource[]
  answered_by?: "coach" | "web"
}

/** Ask Ray a question, grounded in the prep context + a fresh web search. */
export async function sendChat(
  company: string,
  role: string,
  context: string,
  messages: ChatMessage[]
): Promise<ChatReply> {
  const res = await fetch(API_BASE + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...keyHeaders() },
    body: JSON.stringify({ company, role, context, messages }),
  })
  return parseOrThrow<ChatReply>(res)
}

export async function validateKeys(
  gemini: string,
  tavily: string
): Promise<{ gemini: boolean | null; tavily: boolean | null }> {
  const headers: Record<string, string> = {}
  if (gemini.trim()) headers["X-Gemini-Key"] = gemini.trim()
  if (tavily.trim()) headers["X-Tavily-Key"] = tavily.trim()
  const res = await fetch(API_BASE + "/api/validate-keys", { method: "POST", headers })
  return parseOrThrow(res)
}
