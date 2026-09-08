from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import httpx

app = FastAPI(title="Speech to Narasi API", version="7.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent"

class TextRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None

PROMPTS = {
    "fix": "Kamu adalah ahli bahasa Indonesia profesional. Perbaiki teks agar sesuai kaidah Bahasa Indonesia yang baik dan benar. Pertahankan makna asli teks. Jangan menambahkan atau mengurangi isi pesan.\n\nTeks:\n{text}\n\nHasil perbaikan:",
    "narrate": "Kamu adalah penulis profesional berbahasa Indonesia. Ubah teks mentah menjadi narasi yang tersusun rapi, jelas, dan informatif. Susun paragraf yang koheren. Pertahankan informasi penting.\n\nTeks mentah:\n{text}\n\nNarasi:",
    "summarize": "Kamu adalah asisten ahli merangkum teks dalam Bahasa Indonesia. Buat rangkuman yang singkat dan padat. Pertahankan poin-poin penting.\n\nTeks:\n{text}\n\nRangkuman:",
    "rewrite": "Kamu adalah penulis kreatif berbahasa Indonesia. Tulis ulang teks dengan gaya bahasa yang lebih baik. Pertahankan makna asli.\n\nTeks:\n{text}\n\nHasil tulis ulang:",
    "chat": "Kamu adalah AI Assistant berbahasa Indonesia. Jawab singkat dan membantu.\n\nPengguna: {message}"
}

def call_gemini(prompt: str) -> str:
    if not API_KEY:
        raise Exception("GEMINI_API_KEY tidak diset")
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    headers = {"Content-Type": "application/json", "x-goog-api-key": API_KEY}
    response = httpx.post(GEMINI_URL, json=payload, headers=headers, timeout=60.0)
    if response.status_code != 200:
        raise Exception(f"Gemini API error: {response.status_code} - {response.text[:200]}")
    data = response.json()
    if "candidates" in data and len(data["candidates"]) > 0:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    raise Exception("Tidak ada respons dari Gemini API")

@app.get("/api/health")
def health():
    return {"status": "healthy", "version": "7.0"}

@app.post("/api/ai/fix")
def fix_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    result = call_gemini(PROMPTS["fix"].format(text=request.text))
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/narrate")
def narrate_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    result = call_gemini(PROMPTS["narrate"].format(text=request.text))
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/summarize")
def summarize_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    result = call_gemini(PROMPTS["summarize"].format(text=request.text))
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/rewrite")
def rewrite_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    result = call_gemini(PROMPTS["rewrite"].format(text=request.text))
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/chat")
def ai_chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Pesan kosong")
    prompt = PROMPTS["chat"].format(message=request.message)
    if request.context:
        prompt = f"Konteks: {request.context}\n\n{prompt}"
    result = call_gemini(prompt)
    return {"status": "success", "result": result.strip()}
