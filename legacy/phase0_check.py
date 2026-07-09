"""Phase 0 check: confirm our keys work — Tavily reaches the live web, Gemini responds.

Run it with:  uv run python phase0_check.py
"""

import os
from dotenv import load_dotenv

# load_dotenv() reads the .env file and puts the keys into the environment.
load_dotenv()

tavily_key = os.getenv("TAVILY_API_KEY")
google_key = os.getenv("GOOGLE_API_KEY")

# 1. Are both keys present?
print("Checking keys...")
print(f"  TAVILY_API_KEY: {'found' if tavily_key else 'MISSING'}")
print(f"  GOOGLE_API_KEY: {'found' if google_key else 'MISSING'}")

if not tavily_key or not google_key:
    raise SystemExit("\nAdd the missing key(s) to the .env file, then run again.")

# 2. Do a single live Tavily search to prove web access works.
print("\nRunning one live Tavily search...")
from tavily import TavilyClient

client = TavilyClient(api_key=tavily_key)
result = client.search(query="What does the company Anthropic do?", max_results=2)

print(f"Tavily returned {len(result['results'])} results:")
for r in result["results"]:
    print(f"  - {r['title']}")
    print(f"    {r['url']}")

# 3. Ask Gemini one question to prove the model works.
print("\nAsking Gemini one question...")
from langchain_google_genai import ChatGoogleGenerativeAI

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")
answer = llm.invoke("In one short sentence, what is a job-application prep sheet?")
print(f"Gemini says: {answer.content}")

print("\nPhase 0 complete — live web + Gemini both working.")
