from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict
import os
import httpx

app = FastAPI(title="Speech to Narasi API", version="3.0.0")

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
    categories: Optional[Dict[str, str]] = None

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None
    categories: Optional[Dict[str, str]] = None

class GenerateRequest(BaseModel):
    text: str
    categories: Dict[str, str]

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

def build_dynamic_prompt(base_prompt: str, categories: Optional[Dict[str, str]] = None) -> str:
    """Buat prompt dinamis berdasarkan kategori yang dipilih"""
    if not categories:
        return base_prompt
    
    category_instructions = []
    
    if categories.get('writing_style'):
        category_instructions.append(f"- Gaya tulisan: {categories['writing_style']}")
    if categories.get('text_format'):
        category_instructions.append(f"- Format output: {categories['text_format']}")
    if categories.get('tone'):
        category_instructions.append(f"- Nada bahasa: {categories['tone']}")
    if categories.get('audience'):
        category_instructions.append(f"- Target pembaca: {categories['audience']}")
    if categories.get('language_level'):
        category_instructions.append(f"- Tingkat bahasa: {categories['language_level']}")
    
    if category_instructions:
        category_text = "\n".join(category_instructions)
        return f"""Kamu adalah penulis profesional berbahasa Indonesia. Gunakan kriteria berikut:
{category_text}

{base_prompt}"""
    
    return base_prompt

def build_generate_prompt(text: str, categories: Dict[str, str]) -> str:
    """Buat prompt khusus untuk endpoint generate"""
    return f"""Kamu adalah penulis profesional berbahasa Indonesia. Buat narasi berdasarkan kriteria berikut:

Gaya Tulisan: {categories.get('writing_style', 'Ekspositori')}
Format Output: {categories.get('text_format', 'Prosa Murni')}
Nada Bahasa: {categories.get('tone', 'Formal')}
Target Pembaca: {categories.get('audience', 'Umum')}
Tingkat Bahasa: {categories.get('language_level', 'Menengah')}

Aturan:
1. Buat narasi yang sesuai dengan kriteria di atas
2. Pertahankan informasi penting dari teks asli
3. Susun paragraf yang koheren dan runtut
4. Gunakan bahasa yang sesuai dengan target pembaca
5. Hasilkan teks yang rapi dan mudah dipahami

Teks input:
{text}

Hasil narasi:"""

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
    return {"status": "healthy", "version": "3.0"}

@app.post("/api/ai/fix")
def fix_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    prompt = build_dynamic_prompt(PROMPTS["fix"].format(text=request.text), request.categories)
    result = call_gemini(prompt)
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/narrate")
def narrate_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    prompt = build_dynamic_prompt(PROMPTS["narrate"].format(text=request.text), request.categories)
    result = call_gemini(prompt)
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/summarize")
def summarize_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    prompt = build_dynamic_prompt(PROMPTS["summarize"].format(text=request.text), request.categories)
    result = call_gemini(prompt)
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/rewrite")
def rewrite_text(request: TextRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    prompt = build_dynamic_prompt(PROMPTS["rewrite"].format(text=request.text), request.categories)
    result = call_gemini(prompt)
    return {"status": "success", "original": request.text, "result": result.strip()}

@app.post("/api/ai/chat")
def ai_chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Pesan kosong")
    prompt = PROMPTS["chat"].format(message=request.message)
    if request.context:
        prompt = f"Konteks: {request.context}\n\n{prompt}"
    if request.categories:
        prompt = build_dynamic_prompt(prompt, request.categories)
    result = call_gemini(prompt)
    return {"status": "success", "result": result.strip()}

@app.post("/api/ai/generate")
def generate_narrative(request: GenerateRequest):
    """Generate narasi dengan kategori yang dipilih"""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    prompt = build_generate_prompt(request.text, request.categories)
    result = call_gemini(prompt)
    return {"status": "success", "original": request.text, "result": result.strip(), "categories": request.categories}
