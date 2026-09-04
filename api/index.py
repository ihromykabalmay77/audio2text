from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import httpx

app = FastAPI(title="Speech to Narasi API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

class TextRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None

PROMPTS = {
    "fix": """Kamu adalah ahli bahasa Indonesia profesional. Perbaiki teks agar sesuai kaidah Bahasa Indonesia yang baik dan benar.

Aturan:
1. Perbaiki ejaan dan tata bahasa
2. Perbaiki diksi agar tepat
3. Susun kalimat agar koheren dan runtut
4. Pertahankan makna asli teks
5. Tambahkan tanda baca yang tepat
6. Gunakan bahasa formal yang mudah dipahami
7. Jangan menambahkan atau mengurangi isi pesan

Teks yang perlu diperbaiki:
{text}

Hasil perbaikan:""",

    "narrate": """Kamu adalah penulis profesional berbahasa Indonesia. Ubah teks mentah menjadi narasi yang tersusun rapi, jelas, dan informatif.

Aturan:
1. Ubah bahasa informal menjadi formal
2. Susun paragraf yang koheren
3. Pertahankan informasi penting
4. Gunakan struktur kalimat yang baik
5. Tambahkan pengantar dan penutup yang sesuai

Teks mentah:
{text}

Narasi:""",

    "summarize": """Kamu adalah asisten ahli merangkum teks dalam Bahasa Indonesia.

Aturan:
1. Buat rangkuman yang singkat dan padat
2. Pertahankan poin-poin penting
3. Gunakan bahasa formal
4. Maksimal 3-4 paragraf

Teks yang perlu dirangkum:
{text}

Rangkuman:""",

    "rewrite": """Kamu adalah penulis kreatif berbahasa Indonesia. Tulis ulang teks dengan gaya bahasa yang lebih baik.

Aturan:
1. Pertahankan makna asli
2. Perbaiki struktur kalimat
3. Buat lebih menarik dan mudah dipahami
4. Hasilkan versi yang lebih baik

Teks asli:
{text}

Teks hasil tulis ulang:""",

    "chat": """Kamu adalah AI Assistant yang membantu pengguna dengan teks Bahasa Indonesia.
Kamu bisa membantu: merapikan kalimat, memperbaiki tata bahasa, membuat narasi, menulis ulang teks.
Gunakan bahasa Indonesia yang baik dan benar. Jawab singkat dan membantu.

Pengguna: {message}"""
}

def call_gemini(prompt: str) -> str:
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    headers = {"Content-Type": "application/json", "X-goog-api-key": API_KEY}
    response = httpx.post(GEMINI_URL, json=payload, headers=headers, timeout=60.0)
    if response.status_code != 200:
        raise Exception(f"Gemini API error: {response.status_code}")
    data = response.json()
    if "candidates" in data and len(data["candidates"]) > 0:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    raise Exception("Tidak ada respons dari Gemini API")

@app.get("/api/health")
def health():
    return {"status": "healthy", "version": "2.0"}

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
