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
   `user_api_keys` table, one row per user.
3. Row-level security means a row is readable **only** by that user.
4. When they call an MCP tool, the server reads their row back **using their own
   JWT** — so Postgres RLS, not application code, is what keeps users apart.

Paste keys once in the browser; they work in the web app and in Claude.
If no keys are saved, every tool returns a clear message telling them where to add them.

> The server uses the **anon** key (`SUPABASE_ANON_KEY`) for this lookup, never
> the `service_role` key — service_role bypasses RLS and would defeat the point.

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

Required env vars in Vercel:

```
MCP_REQUIRE_AUTH=true
MCP_BASE_URL=https://<your-deployment>      # host root — do NOT append /mcp
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=eyJ...                    # anon, NOT service_role
```

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
