# 🔌 RoleReady MCP Server

Exposes the RoleReady copilot as an **MCP server** so you can use its tools
directly from Claude (Claude Code, Claude Desktop, Cursor, etc.). It's a thin
[FastMCP 3.x](https://gofastmcp.com) wrapper over `backend/pipeline.py`, so the
MCP tools stay in perfect sync with the FastAPI app — same research, same
free-tier discipline (Tavily does the web work, Gemini only reasons).

Server file: [`backend/mcp_server.py`](backend/mcp_server.py) · dependency: `fastmcp`.
Keys are read from the project `.env` (`TAVILY_API_KEY`, `GOOGLE_API_KEY`).

---

## 🧰 Tools

| Tool | What it does |
|---|---|
| `research_company(company, role)` | **Flagship.** Full prep bundle: company intel, visa-sponsorship signals (with confidence + sources), real interview questions, and people to network with |
| `extract_job_posting(url)` | Read a job-link (LinkedIn/Greenhouse/Lever/…) → company, role, cleaned JD |
| `find_people(company, role)` | Up to 6 real employees/recruiters from public LinkedIn profiles |
| `score_resume_fit(company, role, resume_path\|resume_text, jd)` | Fit score 0–100 + strengths, gaps, tailored bullet rewrites |
| `tailor_resume(company, role, resume_path\|resume_text, jd)` | Full resume rewrite for the role + a change-log |
| `ask_ray(company, role, question, context)` | Grounded Q&A: facts → Tavily (with sources), coaching → Gemini |
| `check_api_keys()` | Verify both keys are configured + valid (**zero** Gemini quota) |

> Resume tools accept **either** a file path (`.pdf` / `.txt` / `.md`) **or** raw
> `resume_text`. Your PDFs in `resumes/` work directly, e.g.
> `resume_path="resumes/Varshitha_Gogineni_AI_Engineer.docx"` → use a PDF/TXT
> (docx isn't parsed; pass one of the `.pdf` resumes or `resume_text`).

---

## 🔑 API keys — bring your own

RoleReady runs on **each user's own** free Gemini + Tavily keys, so nobody drains
a shared quota. How a key is found depends on how the server is running.

### Deployed (HTTP + auth) — what real users get

1. User signs in to the RoleReady web app with Google (Supabase Auth).
2. A dialog asks for their Gemini + Tavily keys; they're saved to the
   `user_api_keys` table, one row per user. RLS means a row is readable in the
   browser only by its owner.
3. In Claude, they connect to the MCP server and sign in with the **same Google
   account**. FastMCP verifies the Google token and gets their verified email.
4. The server resolves that email to their saved keys via
   `api_keys_for_email()` — a `SECURITY DEFINER` function that **only
   service_role may execute**, so the join happens inside the database and the
   lookup can't be invoked from a browser or with the anon key.

Paste keys once in the browser; they work in the web app and in Claude. If no
keys are saved, every tool returns a clear message telling them where to add them.

> **Why Google rather than a Supabase JWT.** MCP clients register themselves as
> an OAuth client on the fly. Supabase Auth doesn't support that, and Claude
> refuses with *"Incompatible auth server: does not support dynamic client
> registration"*. FastMCP's Google provider is an OAuth **proxy**: it offers
> dynamic registration to clients while using one fixed Google app upstream.
>
> The trade-off: identity is a Google account rather than a Supabase session, so
> the key lookup uses `service_role` instead of RLS. The email is taken from
> Google's verified token — never from anything the caller supplies.

### Local (stdio) — how you develop

There's no JWT, so keys come from the project `.env`
(`GOOGLE_API_KEY` / `TAVILY_API_KEY`), or from an `env` block in your client config:

```json
"env": {
  "GOOGLE_API_KEY": "your-other-key",
  "TAVILY_API_KEY": "tvly-..."
}
```

**Keys are never tool arguments** — on purpose. Tool arguments pass through the
LLM's context, so a key would be written into the chat transcript. Run
`check_api_keys` any time to see which keys are in play (costs zero quota).

---

## ▶️ Run it locally

```bash
# stdio (what MCP clients spawn)
uv run fastmcp run backend/mcp_server.py

# or over HTTP
uv run fastmcp run backend/mcp_server.py --transport http --port 8000
```

---

## 🌐 The deployed server (what you share with users)

`main.py` serves the MCP server and the REST API from one Vercel deployment:

| Path | What |
|---|---|
| `/mcp` | MCP endpoint — the URL users connect to |
| `/.well-known/oauth-protected-resource/mcp` | OAuth discovery |
| everything else | the existing REST API |

The MCP app is the **outer** app with the REST API mounted beneath it. That's
deliberate: FastMCP advertises its OAuth discovery document at the host root, so
mounting MCP under a prefix makes discovery 404 and the OAuth flow fails silently.

| `/authorize`, `/token`, `/register` | the OAuth endpoints FastMCP exposes as a proxy to Google |
| `/auth/callback` | where Google returns after sign-in |

Required env vars in Vercel:

```
MCP_REQUIRE_AUTH=true
MCP_BASE_URL=https://<your-deployment>      # host root — do NOT append /mcp
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # server-side only
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=...
```

The Google OAuth app must list `<MCP_BASE_URL>/auth/callback` under
**Authorised redirect URIs**, and the consent screen must be **published** —
while it's in Testing mode only accounts added as test users can sign in.

A user then connects with no keys or secrets in the command:

```bash
claude mcp add --transport http roleready https://<your-deployment>/mcp
```

Their browser opens, they sign in with Google, and their saved keys are used
automatically.

---

## 🤝 Connect to Claude Code (CLI)

Already added (local scope). To re-add on another machine:

```bash
claude mcp add roleready --scope local -- \
  uv run --directory "/Users/varsh/Documents/AI learning folder from basics/job-app-copilot" \
  fastmcp run backend/mcp_server.py
```

Check it: `claude mcp list` → `roleready … ✔ Connected`.

---

## 🖥️ Connect to Claude Desktop

Claude Desktop runs servers in an **isolated environment with no shell PATH**, so
use the **absolute path to `uv`**. Edit
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "roleready": {
      "command": "/Users/varsh/.local/bin/uv",
      "args": [
        "run",
        "--directory",
        "/Users/varsh/Documents/AI learning folder from basics/job-app-copilot",
        "fastmcp",
        "run",
        "backend/mcp_server.py"
      ]
    }
  }
}
```

Then **fully quit and reopen Claude Desktop**. Keys load from `.env` automatically,
so no `env` block is needed. (Alternatively: `uv run fastmcp install claude-desktop
backend/mcp_server.py --env-file .env`.)

---

## 💬 Try it

> "Use RoleReady to research the **AI Engineer** role at **Anthropic** — what's
> the visa-sponsorship situation and what interview questions come up?"

> "Extract this job posting `<url>`, then score my resume at
> `resumes/Varshitha_Gogineni_AI_Engineer_...pdf` against it."
