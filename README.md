# 🎯 RoleReady

**Get role-ready in one minute.** An AI job-application copilot built for
**international students** — the one thing mainstream resume tools ignore is
**visa-sponsorship intelligence**, and that's RoleReady's core hook.

Paste a job link (or type the details), upload your resume, and RoleReady
researches the company, checks visa-sponsorship signals, finds real interview
questions, surfaces people to connect with, scores your fit, and rewrites your
resume for the role — then lets you chat with **Ray**, a grounded assistant.

---

## ✨ Features

| Feature | What you get |
|---|---|
| 🔗 **Job-link autofill** | Paste a LinkedIn/Greenhouse/Lever URL → company, role & JD extracted automatically |
| 🏢 **Company intel** | What they do, size, HQ, funding, recent news — every claim linked to a source |
| 🛂 **Visa-sponsorship signals** | H-1B / OPT / STEM OPT evidence with a confidence level (never a guarantee) |
| 🎤 **Real interview questions** | Pulled from Glassdoor & interview-experience posts, with source links |
| 👥 **People to connect with** | Real employees/recruiters from public LinkedIn profiles |
| 📊 **Fit score** | 0–100 with strengths, gaps, and tailored bullet rewrites |
| 📄 **Tailored resume** | Full rewrite for the role + live document preview + download / print-to-PDF |
| 💬 **Ray (chatbot)** | Grounded Q&A that routes factual questions to web search and coaching questions to the LLM |
| 🔐 **Google sign-in + accounts** | Onboarding, saved profile, and application history |
| 🔑 **Bring your own API keys** | Optional — use your own Gemini/Tavily keys (stored only in your browser) |

---

## 🧱 Tech stack

- **Frontend:** React + TypeScript, Vite, Tailwind CSS v4, shadcn/ui
- **Backend:** FastAPI (Python 3.12), managed with `uv`
- **AI:** Google **Gemini** (`gemini-2.5-flash-lite`) for synthesis/scoring/coaching;
  **Tavily** for all web research + factual answers
- **Auth & DB:** **Supabase** (Google OAuth + Postgres)

Design principle: **Tavily does the web work (cheap, parallel); Gemini only does
reasoning.** A full prep costs just **2 Gemini calls**, with a global rate
limiter + retry engine so it stays inside the free tier.

---

## 🚀 Quickstart (local)

**Prerequisites:** Python 3.12 + [uv](https://docs.astral.sh/uv/), Node 20+, and
keys for Tavily, Google Gemini, and a Supabase project.

### 1. Backend

```bash
cd job-app-copilot
cp .env.example .env          # fill in TAVILY / GOOGLE / SUPABASE keys
uv sync                       # install deps
uv run uvicorn backend.server:app --reload --port 8000
```

### 2. Frontend

```bash
cd job-app-copilot/frontend
cp .env.example .env          # fill in VITE_SUPABASE_URL + ANON key
npm install
npm run dev                   # http://localhost:5173
```

The Vite dev server proxies `/api/*` to the backend on `:8000`.

### 3. Supabase setup (one time)

Create a project, then in the SQL editor run:

```sql
create table profiles (
  email text primary key, first_name text, last_name text, phone text,
  target_roles text[], created_at timestamptz default now()
);
create table applications (
  id bigint generated always as identity primary key,
  email text references profiles(email), company text, role text,
  fit_score int, created_at timestamptz default now()
);
```

Then enable **Google** under Authentication → Providers, and set the Site URL /
redirect URLs to your app origin. (Details in [`AGENTS.md`](./AGENTS.md) §9.)

---

## 🗂️ Project structure

```
job-app-copilot/
├── backend/                 # FastAPI + AI pipeline (modular)
│   ├── server.py            #   HTTP API (endpoints, CORS, error mapping)
│   ├── config.py            #   Gemini client, rate limiter, retry engine
│   ├── schemas.py           #   Pydantic models (API contract)
│   ├── tavily_utils.py      #   parallel search + direct-answer helpers
│   ├── research.py          #   job extraction, prep bundle, people
│   ├── resume.py            #   fit score, tailored resume
│   ├── chat_engine.py       #   Ray (Gemini↔Tavily routing)
│   └── pipeline.py          #   re-export facade
├── frontend/                # React + Vite + Tailwind + shadcn/ui
│   └── src/
│       ├── components/      #   ApplicationForm, ResultsDashboard, ChatWidget, ...
│       ├── lib/             #   api.ts, db.ts, supabase.ts, types.ts
│       └── hooks/           #   useAuth.ts
├── legacy/                  # original Streamlit prototype (archived)
├── requirements.txt         # backend deps for deploy hosts
├── AGENTS.md                # full project memory / architecture reference
└── README.md
```

---

## ⚙️ Environment variables

**Backend (`.env`)** — see [`.env.example`](./.env.example)
`TAVILY_API_KEY`, `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY` (service role),
optional `GEMINI_MODEL`, `ALLOWED_ORIGINS`.

**Frontend (`frontend/.env`)** — see [`frontend/.env.example`](./frontend/.env.example)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

All `.env` files are gitignored — never commit real keys.

---

## 🚢 Deploy (outline)

- **Frontend → Vercel:** root `frontend/`, build `npm run build`, output `dist/`.
  Set `VITE_SUPABASE_*` env vars.
- **Backend → Render / Railway:** `pip install -r requirements.txt`, start
  `uvicorn backend.server:app --host 0.0.0.0 --port $PORT`. Set the backend env
  vars + `ALLOWED_ORIGINS=https://your-frontend-domain`.
- Point the frontend's API base at the deployed backend, and add the deployed
  domain to Google OAuth redirect URIs + Supabase URL configuration.

---

## 📎 More

- **[AGENTS.md](./AGENTS.md)** — the full architecture reference, key decisions,
  and operational gotchas (read this before making changes).

Built as a learning + portfolio project. Sponsorship signals are evidence-based,
never a guarantee — always verify with the employer.
