# AGENTS.md — RoleReady

> Project memory for AI agents and humans. Read this first. It captures what
> RoleReady is, how it's built, how to run it, every key decision, and the
> gotchas learned the hard way. If a session's context is lost, this file is
> the source of truth.

---

## 1. What this is

**RoleReady** — an AI job-application copilot **for international students**. The
unique hook is **visa-sponsorship intelligence** (H-1B / OPT / STEM OPT), which
mainstream resume tools ignore.

**User flow:** sign in with Google → onboard (name, phone, up to 3 target roles)
→ dashboard. On the dashboard the user either **pastes a job link** OR **enters
company/role/JD manually**, uploads their resume, and clicks **Prep me**. They get:

- **Company intel** — what they do, size, HQ, funding, recent news (with sources)
- **Visa-sponsorship signals** — evidence + confidence, never a guarantee
- **Real interview questions** — pulled from Glassdoor/blogs, with source links
- **People to connect with** — real employees/recruiters from public LinkedIn
- **Fit score** (0–100) + strengths/gaps + tailored bullets
- **Full tailored resume** — document-style preview + download/print
- **Ray** — a floating chatbot grounded in the research + live web

Positioning note: this is a portfolio + learning project. The owner is Varshitha
Gogineni (MS Information Science, graduating 2026). Mentor-led build style: one
thing at a time, explain concepts, no giant code dumps, be decisive.

---

## 2. Architecture

```
Browser (React SPA, :5173)
   │  Google OAuth (Supabase Auth)  ─────────────►  Supabase (auth + Postgres DB)
   │  /api/* (Vite proxy → :8000)
   ▼
FastAPI backend (:8000)
   │  pipeline.py  ── Gemini (synthesis/scoring/chat)  via langchain-google-genai
   │               ── Tavily (all web research + factual answers)
```

- **Frontend:** React + TypeScript + Vite + Tailwind v4 + shadcn/ui ("base"
  library, "nova" preset). Path alias `@/* → src/*`.
- **Backend:** FastAPI (sync endpoints run on anyio threadpool). HTTP layer in
  `backend/server.py`. AI logic is a MODULAR package: `config.py` (Gemini client,
  limiter, retry), `schemas.py` (Pydantic), `tavily_utils.py` (parallel search +
  direct answers), `research.py` (extraction, prep bundle, people), `resume.py`
  (fit/tailor), `chat_engine.py` (Ray). `pipeline.py` is a re-export FACADE — so
  `from backend import pipeline; pipeline.<name>` still works everywhere.
- **Auth + DB:** Supabase (Google OAuth + Postgres tables `profiles`, `applications`).
- **AI:** Google **Gemini `gemini-2.5-flash-lite`** (free tier) for
  synthesis/scoring/generation/coaching; **Tavily** for ALL web research and for
  factual chat answers (0 Gemini). Optional local Chroma exists but the app does
  NOT use a vector store — resumes are small, so full text is passed directly.

### The old Streamlit app is RETIRED
`app.py` + `phase0..6_*.py` are the original Streamlit learning build (kept on
disk as artifacts). **Do not edit them for features** — the product is now
React + FastAPI. `deepagents` was tried and removed (too many Gemini calls).

---

## 3. Run it

Two servers. From the project root (`job-app-copilot/`):

```bash
# Backend (NO --reload; see gotcha #7). Runs on :8000
uv run uvicorn backend.server:app --port 8000

# Frontend (Vite dev server, proxies /api → :8000). Runs on :5173
cd frontend && npm run dev
```

Or via the Claude Code preview: `.claude/launch.json` at the WORKSPACE root
(`/Users/varsh/Documents/AI learning folder from basics/.claude/launch.json`)
defines a `roleready` config (frontend) and a legacy `copilot` config (Streamlit).

- Python env: **uv** project, Python 3.12. Add deps with `uv add <pkg>`.
- Node: v24, npm. Frontend build check: `cd frontend && npm run build`.
- Open **http://localhost:5173**.

---

## 4. Secrets & keys (all gitignored — NEVER commit real values)

- **`.env`** (backend, project root): `TAVILY_API_KEY`, `GOOGLE_API_KEY`,
  `SUPABASE_URL`, `SUPABASE_KEY` (service_role — bypasses RLS, server-side only).
- **`frontend/.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon key is
  public-by-design, safe in the browser).
- **`.streamlit/secrets.toml`**: legacy Streamlit-native auth (unused by React app).
- **BYO keys:** users can paste their own Gemini/Tavily keys in the UI ("API keys"
  button). Stored in browser localStorage ONLY, sent as headers `X-Gemini-Key` /
  `X-Tavily-Key`, used per-request server-side, falling back to `.env` keys.

**Supabase project:** ref `qdlhkblttmlcgogguemj` (project name "roleready").
**Google OAuth client** lives in GCP project `gen-lang-client-0394236119`;
client_id ends in `...apps.googleusercontent.com` (client IDs are not secret;
the client SECRET is — kept in Supabase Auth config, not in this repo).

---

## 5. Backend: the AI pipeline (`backend/pipeline.py`)

### Free-tier discipline (this is the heart of the design)
Gemini free tier for `gemini-2.5-flash-lite` ≈ **15 RPM, ~250k TPM, ~1000 RPD,
per project**. The killer is **RPD** on heavy-testing days. Rules:

1. **Tavily does ALL web research** (0 Gemini tokens) and runs its searches in
   **parallel** (`_parallel_search` via `ThreadPoolExecutor`).
2. **Every Gemini call goes through `run_gemini(thunk, cap=, attempts=3)`**:
   - A **global `threading.Semaphore(1)`** → only ONE Gemini call in flight ever.
   - A **per-API-key `InMemoryRateLimiter(rps=0.15, bucket=1)`** → spaces starts
     (~9 RPM sustained, headroom under 15).
   - **Retries** 429-per-minute (obeys server `retryDelay`, capped) AND transient
     **503/overload** (short 4/8s backoff). The retry `time.sleep` happens
     **OUTSIDE the semaphore** so a backing-off call doesn't freeze the app.
   - **Per-DAY quota** → raises `DailyQuotaError` immediately (retry can't help).
3. **`max_retries=0`** on the LLM (SDK's own retries would bypass our limiter).

### Gemini calls per action (target: keep this low)
| Function | Gemini calls | Notes |
|---|---|---|
| `prep_bundle(company, role)` | **1** | MERGED prep-sheet + people; 9 Tavily searches in parallel; 30-min TTL cache `_bundle_cache`; falls back to 2 separate calls on schema failure |
| `run_fit_score(resume, company, role, jd)` | 1 | needs resume — can't offload |
| `tailor_resume(...)` | 1 | full resume rewrite |
| `extract_job_posting(url)` | 1 | Tavily extract + parse |
| `chat(...)` (Ray) | **0 or 1** | see routing below |
| `build_prep_sheet` / `find_people` | 1 each | standalone/fallback only |

So a normal "Prep me" = **2 Gemini calls** (bundle + fit).

### Ray chatbot routing (Gemini↔Tavily balance)
`_route(question)` decides per message:
- **Advisory/coaching/personal** (regex `_ADVISORY` + short-followup `_FOLLOWUP`)
  → **Gemini coach**, grounded in the prep context string, NO Tavily search.
- **Factual** (company/role/visa lookups) → **`_tavily_answer()`** =
  `client.search(include_answer="advanced")` → direct synthesized answer,
  **0 Gemini**, + source chips. Visa answers get the not-a-guarantee disclaimer.
- **Terminal fallback:** if Gemini errors/exhausted on an advisory Q, fall back to
  a Tavily answer so **Ray NEVER shows a rate-limit error**.
- `ChatReply.answered_by` = `"coach" | "web"` → frontend shows a "via web search" badge.

### Key validation (zero quota)
`validate_gemini_key` uses a REST `models.list` call (NOT a live generate) so it
costs no RPD. `validate_tavily_key` does a tiny search.

---

## 6. Backend endpoints (`backend/server.py`)

| Method + path | Purpose |
|---|---|
| `GET  /api/health` | liveness |
| `POST /api/validate-keys` | check BYO keys (zero Gemini quota) |
| `POST /api/extract-job` | `{url}` → `{company, role, job_description}` |
| `POST /api/prep-bundle` | `{company, role}` → `{prep_sheet, people}` (1 Gemini) |
| `POST /api/fit-score` | multipart: company, role, jd, resume(PDF) → `FitResult` |
| `POST /api/people` | standalone people (unused by UI; kept as fallback) |
| `POST /api/chat` | `{company, role, context, messages[]}` → `ChatReply` |
| `POST /api/tailor-resume` | multipart resume → `TailoredResume` |

CORS allows `localhost:5173`. `_friendly(e)` maps errors to clean messages and
**distinguishes**: per-DAY quota ("resets midnight PT, add own key") vs per-minute
("wait ~30s") vs **503** ("Gemini briefly overloaded — not your quota, retry").

---

## 7. Frontend (`frontend/src`)

- **`App.tsx`** — root. Auth gate → onboarding gate → dashboard. `handleSubmit`
  calls `fetchPrepBundle` (splits into `prep` + `people` state) and `fetchFitScore`
  in parallel; records each run to `applications`. Renders `ChatWidget` after
  results exist. Builds the Ray `context` string via `buildChatContext(prep, fit)`.
- **`components/`**: `LoginScreen`, `OnboardingScreen` (confetti on save),
  `ApplicationForm` (tabbed: Job link | Manual; shared resume + Prep me),
  `ResultsDashboard` (summary cards + tabs Company/Visa/Resume/Interview/People),
  `ScoreRing` (animated count-up gauge), `TailoredResumeSection` (preview dialog
  + .md download + print-only window), `SettingsDialog` (BYO keys), `ChatWidget` (Ray).
- **`lib/`**: `api.ts` (all fetch calls + `keyHeaders()` for BYO keys),
  `db.ts` (Supabase profile/application helpers), `supabase.ts` (client),
  `types.ts` (mirror of backend Pydantic schemas), `utils.ts` (shadcn `cn`).
- **`hooks/useAuth.ts`** — Supabase session hook (`signInWithGoogle`, `signOut`).
- **`index.css`** — theme + motion. Pastel palette (violet `--primary`, lavender/
  pink/sky radial-gradient body wash, frosted `[data-slot=card]`), `.btn-hero`
  gradient CTAs, `.anim-fade-up`/`.anim-d1..6` stagger, `.hover-lift`, `.top-loader`,
  typing dots, panel-in animation.

### Design language
Name **RoleReady**, tagline "Get role-ready in one minute." Pastel/violet,
rounded, soft shadows, subtle motion, "proper webapp" feel. Chatbot persona = **Ray**.

---

## 8. Data model (Supabase Postgres, RLS OFF for now)

```sql
profiles(email PK, first_name, last_name, phone, target_roles text[], created_at)
applications(id, email→profiles.email, company, role, fit_score, created_at)
```

- Written from the frontend with the anon key (RLS is disabled — acceptable for
  a demo; harden with RLS policies keyed on `auth.uid()` before real launch).
- Tables were created via the **Supabase Management API**
  (`POST https://api.supabase.com/v1/projects/{ref}/database/query` with a personal
  access token) because the SQL Editor UI kept failing during a Supabase incident.

---

## 9. Auth flow (Google via Supabase)

Browser → `supabase.auth.signInWithOAuth({provider:'google'})` → Google consent →
Supabase callback (`https://<ref>.supabase.co/auth/v1/callback`) → back to app.
Setup that MUST be in place:
- Supabase → Authentication → Providers → **Google enabled** (the ENABLE TOGGLE,
  not just pasting the client id/secret) with the Google client id + secret.
- Supabase → Authentication → URL Configuration → **Site URL** `http://localhost:5173`,
  **Redirect URLs** include `http://localhost:5173/**`.
- Google Cloud OAuth client → **Authorized redirect URIs** must include the
  Supabase callback URL above (else Google 400 `redirect_uri_mismatch`).

---

## 10. Gotchas & operational notes (learned the hard way)

1. **429 ≠ 503.** 429 = rate/quota limit (per-minute recovers; per-day resets
   midnight Pacific). 503 = Google model overloaded, transient — **changing keys
   does NOT help**. Both are auto-retried now.
2. **RPD is the real killer.** Heavy testing exhausts the ~1000/day. Fix: add your
   OWN Gemini key in the UI (fresh project = fresh quota) or wait for reset.
3. **Servers auto-sleep in the Claude preview.** "localhost refused to connect" /
   Streamlit "reconnecting" flicker = server stopped; just restart it.
4. **`qna_search` is DEPRECATED** — use `search(include_answer="advanced")`.
5. **Embedding model** (if ever re-added) is `models/gemini-embedding-001`
   (NOT `text-embedding-004`, which 404s on this key).
6. **Gemini free tier is per-MODEL, per-PROJECT daily buckets.** Switching MODEL
   name gives a fresh bucket; a billing account attached to a project DISABLES the
   free tier (limit 0).
7. **Backend runs WITHOUT `--reload`** → after editing backend files, restart
   uvicorn or changes won't take effect.
8. **LinkedIn `jobs/search-results/?currentJobId=...` URLs are login-walled** →
   extraction is unreliable. Prefer `linkedin.com/jobs/view/<id>`, Greenhouse/Lever,
   or the Manual tab.
9. **Never commit secrets.** `.env`, `frontend/.env`, `.streamlit/secrets.toml`,
   `chroma_db/` are gitignored.

---

## 11. Status & next steps

**DONE (all working, verified):** React+FastAPI rebuild, Google auth + accounts +
onboarding, two-mode form, job-link extraction, prep-bundle, fit score, people,
tailored resume + preview, Ray chatbot with Gemini↔Tavily routing, pastel theme +
animations, full free-tier hardening (semaphore/limiter/retry/503/RPD-RPM split).

**DEPLOYED & LIVE (2026-07-09):**
- **Frontend:** Vercel → **https://roleready-fawn.vercel.app** (root dir `frontend`,
  Vite preset; env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE=Render URL).
- **Backend:** Render (free) → **https://roleready-backend-e7og.onrender.com** (from
  `render.yaml` blueprint; env: TAVILY/GOOGLE/SUPABASE keys + `ALLOWED_ORIGINS=https://roleready-fawn.vercel.app`).
  Free tier sleeps after 15 min → first request ~50s cold start.
- **Repo:** github.com/Varshithagogineni/roleready (branch `main`; Vercel auto-deploys on push).
- **API base:** frontend uses `VITE_API_BASE` (in `api.ts` all fetches prepend `API_BASE`).
- Supabase Site URL + Redirect URLs include the Vercel domain (kept localhost for dev).
- Verified live: backend health OK, CORS allows the Vercel origin, frontend serves.

**Deploy gotcha solved:** Google login did nothing in prod because the `VITE_SUPABASE_ANON_KEY`
env var in Vercel was corrupted (masked-dots pasted instead of the real value → invalid client).
Fix: **hardcoded the public Supabase URL + anon key as fallbacks in `frontend/src/lib/supabase.ts`**
(anon key is public-by-design; env overrides only if it's a valid 3-segment JWT). Verified live.

**Still optional:** Google OAuth consent screen is in **Testing mode** → only added test users can
sign in; to let anyone use it, add them as test users or Publish the consent screen. Also: custom
domain; per-minute chat budget bucket; **enable RLS** (tables are currently world-read/write via the
public anon key); rotate the service_role key (shown in chat during deploy).
- From the Fable plans, still optional: per-minute chat budget bucket, regex-based
  people fallback (0 Gemini), factual-chat answer cache, RLS policies on Supabase.

---

## 12. Working style for agents on this project

- Mentor tone, decisive, explain new concepts briefly, no giant unexplained dumps.
- Keep Gemini calls minimal; prefer Tavily for anything factual.
- After backend edits: restart uvicorn + `npm run build` the frontend to typecheck.
- Verify with real calls where possible; don't claim success without checking.
- Keep this file updated when architecture, endpoints, or key decisions change.
