"""Vercel entrypoint — serves BOTH the MCP server and the RoleReady REST API.

Vercel auto-detects `app` here; locally/Render we run backend.server:app directly.

    /mcp                                    → MCP server (what Claude connects to)
    /.well-known/oauth-protected-resource/… → OAuth discovery for that MCP server
    everything else                         → the FastAPI REST API the web app uses

Why the MCP app is the OUTER app rather than something mounted at "/mcp":
FastMCP advertises its OAuth discovery document at the HOST ROOT (the
`WWW-Authenticate` header on a 401 points at `/.well-known/...`). Mounting the
MCP app under a prefix pushes those routes down a level, the client's discovery
request 404s, and the whole OAuth flow fails — with no obvious error. So the
MCP app keeps the root, and the REST API is mounted as the catch-all below it.
Route order matters: FastMCP's own routes are registered first and win.

stateless_http=True because Vercel may route each request to a different
serverless instance, so no session state can live in memory between calls.
"""

from starlette.routing import Mount

from backend.mcp_server import mcp
from backend.server import app as api_app

app = mcp.http_app(path="/mcp", stateless_http=True)

# Catch-all: anything that isn't an MCP or OAuth-discovery route is the REST API.
app.router.routes.append(Mount("/", app=api_app))
