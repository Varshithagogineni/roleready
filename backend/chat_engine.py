"""Ray — the grounded chat assistant. Routes each question:
- factual company/role/visa lookups → Tavily direct answer (0 Gemini)
- advisory/coaching/personal questions → Gemini coach (grounded in prep context)
- if Gemini is unavailable, degrade gracefully to a Tavily answer (never error)."""

import re
from typing import List, Literal, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from backend.config import make_llm, run_gemini, tavily_client
from backend.schemas import ChatReply
from backend.tavily_utils import tavily_answer

# Advisory / coaching / personal → needs the LLM + conversation + prep context.
_ADVISORY = re.compile(
    r"\b(my|me|i|i'm|im|myself|should i|how do i|help me|am i|stand ?out|prepare|"
    r"practice|review|improve|answer|say|write|draft|negotiate|explain|tailor|mock|"
    r"fit|score|gaps?|strengths?|weakness(es)?|resume|cv|cover ?letter|star)\b",
    re.I,
)
# Short context-dependent follow-ups also need the coach (Tavily answers are stateless).
_FOLLOWUP = re.compile(r"\b(that|it|this|they|those|why|more|again|elaborate)\b", re.I)


def _route(question: str) -> Literal["coach", "web"]:
    if _ADVISORY.search(question):
        return "coach"
    if len(question.split()) < 6 and _FOLLOWUP.search(question):
        return "coach"
    return "web"  # factual company/role lookup → Tavily, 0 Gemini


def chat(
    company: str, role: str, context: str, messages: List[dict],
    gemini_key: Optional[str] = None, tavily_key: Optional[str] = None,
) -> ChatReply:
    question = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            question = m.get("content", "")
            break

    client = tavily_client(tavily_key)

    # ── Factual questions → Tavily answer, ZERO Gemini ──────────────────────
    if _route(question) == "web":
        try:
            answer, sources = tavily_answer(client, company, role, question)
            return ChatReply(answer=answer, sources=sources, answered_by="web")
        except Exception:
            pass  # fall through to the coach if Tavily has no direct answer

    # ── Advisory questions → Gemini coach (grounded in prep context) ────────
    system = f"""You are Ray, a friendly, sharp job-application assistant inside the RoleReady app.
You are helping the user with their application for the {role} role at {company}.

What we already researched for them (use this):
{(context or "(no prep summary provided)")[:4000]}

Rules:
- Be concise, warm, and practical — you're a coach, not a search dump.
- Ground answers in the research above and the conversation.
- Visa/sponsorship: only state what evidence shows, never guarantee. Encourage verifying with the employer.
- If you don't know, say so and suggest how to find out. Never invent facts, people, or numbers.
- Keep answers to a few short paragraphs or bullets unless asked for more."""

    convo = [SystemMessage(content=system)]
    for m in messages[-8:]:
        if m.get("role") == "assistant":
            convo.append(AIMessage(content=m.get("content", "")))
        else:
            convo.append(HumanMessage(content=m.get("content", "")))

    try:
        resp = run_gemini(lambda: make_llm(gemini_key).invoke(convo), cap=20, attempts=3)
        answer = resp.content if isinstance(resp.content, str) else str(resp.content)
        return ChatReply(answer=answer, sources=[], answered_by="coach")
    except Exception:
        # Gemini exhausted/limited → never error at the user; give a web answer.
        try:
            answer, sources = tavily_answer(client, company, role, question)
            return ChatReply(
                answer="Quick web answer while my coaching side catches its breath — "
                       "ask again in a minute for a tailored take:\n\n" + answer,
                sources=sources,
                answered_by="web",
            )
        except Exception:
            return ChatReply(
                answer="I'm briefly over my thinking limit — give me ~30 seconds and ask again.",
                sources=[],
                answered_by="coach",
            )
