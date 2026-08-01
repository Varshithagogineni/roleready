🎓 I built and shipped my first real AI product — RoleReady 🚀

Live 👉 https://roleready-fawn.vercel.app

As an international student, I know the job hunt has a layer most tools ignore: visa sponsorship. You can spend hours tailoring a resume for a company that's never sponsored an H-1B — and regular tools won't tell you. The idea clicked at a LangChain × Tavily student event, so I built it.

💡 The problem

• Job prep is slow and scattered — company research, role intel, interview Qs, resume tailoring, all in different tabs.
• International students have a blind spot: does this company sponsor OPT / STEM OPT / H-1B?

RoleReady gets you "role-ready in one minute": give it a company (or job link) + your resume, and get a one-page prep sheet.

✨ What it does

📋 Company & role snapshot from the live web
🛂 Visa-sponsorship signals — real sources + a confidence level (the part I care about most)
🎯 A resume-to-role fit score
✍️ A tailored resume to preview and download
🤝 Real people you could reach out to
💬 "Ray," a chat assistant grounded in live web search

🛠️ The stack — what each piece does

• LangChain → orchestrates the AI: structured outputs, prompting, rate-limiting.
• Tavily → the real-time web research engine — what makes answers factual and current (company intel, sponsorship signals, real people). Factual questions get a synthesized web answer with zero LLM tokens.
• Google Gemini (2.5 Flash-Lite) → the reasoning/writing model.
• FastAPI backend + React / Vite / TypeScript / Tailwind / shadcn-ui frontend.
• Supabase → Google sign-in + saved applications.
• Deployed on Vercel (frontend + serverless backend).
• Also got hands-on with MCP (Model Context Protocol) — I even deployed via the Vercel MCP.

🔑 Bring your own API key — plug in your own Gemini + Tavily keys in-app. You're never blocked by my limits, keys stay in your browser, and it's genuinely shareable.

🙏 A big thank-you to the Tavily team

• Tavily gave me 4 months of free credits through their student offer — that's what made building and testing this possible. Thank you for supporting students who learn by building. 🧡
• Students building with AI: Tavily has a free-for-students offer, highly recommend 👉 https://help.tavily.com/articles/6606514713-student-account

📚 What I learned

• How agentic AI comes together — LLM and web search as two jobs (reason vs. retrieve).
• Keeping AI cheap + reliable: routing facts to search, caching, rate-limiting, merging calls.
• Real deployment: serverless, cold starts, CORS, env vars, OAuth.
• Shipping beats perfect — my first end-to-end product is live. 🎉

Feedback welcome 🙌 Try it: https://roleready-fawn.vercel.app

#AI #LangChain #Tavily #GenerativeAI #H1B #InternationalStudents #BuildInPublic #Vercel
