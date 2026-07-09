"""Phase 5: Resume RAG — Index → Retrieve

Load a resume PDF, split into chunks, embed with Google embeddings,
store in Chroma. Then retrieve matching sections for a query.

New concepts:
- Embeddings: text → vector of numbers that captures meaning
- Chunking: split the doc into small pieces for precise retrieval
- Chroma: local vector store (saves to ./chroma_db/ on disk)
- Retrieval: embed a query → find the most similar stored chunks

Run: uv run python phase5_resume_rag.py
"""

import os
import pypdf
from dotenv import load_dotenv
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document

load_dotenv()

# ── Change this to whichever resume matches the role you're applying for ──────
RESUME_PATH = "resumes/Varshitha_Gogineni_ML_Engineer.pdf"
# ─────────────────────────────────────────────────────────────────────────────


# ── Step 1: Load the PDF ──────────────────────────────────────────────────────
# pypdf reads the PDF and extracts raw text from each page.

def load_pdf(path: str) -> str:
    reader = pypdf.PdfReader(path)
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages)

resume_text = load_pdf(RESUME_PATH)
print(f"Loaded resume: {len(resume_text)} characters")


# ── Step 2: Split into chunks ─────────────────────────────────────────────────
# RecursiveCharacterTextSplitter tries to split on paragraph breaks first,
# then sentences, then words — keeping chunks as semantically whole as possible.
#
# chunk_size=400:  each chunk ≈ 1-2 bullet points
# chunk_overlap=40: adjacent chunks share 40 chars so nothing gets cut mid-thought

splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=40)
chunks = splitter.split_text(resume_text)

# Wrap each chunk in a Document (LangChain's standard format: text + metadata)
docs = [
    Document(
        page_content=chunk,
        metadata={"source": RESUME_PATH, "chunk_index": i},
    )
    for i, chunk in enumerate(chunks)
]

print(f"Split into {len(docs)} chunks")
print(f"  Example chunk #{1}: {docs[1].page_content[:120]}...")


# ── Step 3: Embed and store in Chroma ────────────────────────────────────────
# GoogleGenerativeAIEmbeddings turns each chunk into a vector of numbers.
# text-embedding-004 is Google's latest embedding model (free with Gemini key).
# Chroma saves these vectors locally to ./chroma_db/ so we don't re-embed every run.

print("\nEmbedding chunks and storing in Chroma...")

embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

vectorstore = Chroma.from_documents(
    documents=docs,
    embedding=embeddings,
    persist_directory="./chroma_db",
    collection_name="resume",
)

print(f"Stored {len(docs)} chunks in ./chroma_db/")


# ── Step 4: Demo retrieval ────────────────────────────────────────────────────
# This is what Phase 6 will use: given a JD requirement, find the resume
# bullets that match it most closely.

print("\n" + "=" * 60)
print("RETRIEVAL DEMO")
print("=" * 60)

retriever = vectorstore.as_retriever(search_kwargs={"k": 2})

queries = [
    "production ML model deployment and serving",
    "RAG pipeline and vector databases",
    "Python and LangChain project experience",
    "hackathon wins and achievements",
]

for query in queries:
    print(f"\nQuery: \"{query}\"")
    results = retriever.invoke(query)
    for r in results:
        print(f"  → {r.page_content[:200].strip()}")

print("\nPhase 5 complete — resume indexed and retrieval working.")
print("./chroma_db/ is ready for Phase 6 (fit score + tailored resume).")
