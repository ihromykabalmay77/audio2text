from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict
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
    categories: Optional[Dict[str, str]] = None

class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None

class GenerateRequest(BaseModel):
    text: str
    categories: Dict[str, str]

PROMPTS = {
    "fix": "Kamu adalah ahli bahasa Indonesia profesional. Perbaiki teks agar sesuai kaidah Bahasa Indonesia yang baik dan benar. Pertahankan makna asli teks. Jangan menambahkan atau mengurangi isi pesan.\n\nTeks:\n{text}\n\nHasil perbaikan:",
    "narrate": """Kamu adalah penulis profesional berbahasa Indonesia. Ubah teks mentah menjadi narasi yang tersusun rapi, jelas, dan informatif.

ATURAN PENTING - Analisis dan Format Teks:
1. **JUDUL/HEADING**: Jika ada bagian yang merupakan judul utama atau sub-judul, format sebagai heading dengan menulis di baris terpisah dan huruf besar di awal kata. Contoh: "Latar Belakang Masalah"
2. **POIN-POIN/DAFTAR**: Jika ada bagian yang berisi item-item, langkah-langkah, atau poin-poin, format sebagai daftar bernomor atau bullet. Gunakan format:
   - 1. 2. 3. untuk daftar berurutan
   - • untuk daftar tidak berurutan
3. **KALIMAT KUNCI/PENTING**: Jika ada kalimat atau frasa yang merupakan inti/poin penting, balut dengan tanda *asterisk* untuk italic. Contoh: *faktor utama yang mempengaruhi*.
4. **PARAGRAF BIASA**: Sisanya susun sebagai paragraf yang koheren dan runtut.
5. Pisahkan setiap section dengan baris kosong.
6. Pertahankan semua informasi penting dari teks asli.

Teks mentah:
{text}

Narasi dengan format:""",
    "summarize": "Kamu adalah asisten ahli merangkum teks dalam Bahasa Indonesia. Buat rangkuman yang singkat dan padat. Pertahankan poin-poin penting. Gunakan format bullet (•) untuk poin-poin utama.\n\nTeks:\n{text}\n\nRangkuman:",
    "rewrite": "Kamu adalah penulis kreatif berbahasa Indonesia. Tulis ulang teks dengan gaya bahasa yang lebih baik. Pertahankan makna asli. Format dengan heading, paragraf, dan bullet jika sesuai.\n\nTeks:\n{text}\n\nHasil tulis ulang:",
    "chat": "Kamu adalah AI Assistant berbahasa Indonesia. Jawab singkat dan membantu.\n\nPengguna: {message}"
}

def build_dynamic_prompt(base_prompt: str, categories: Optional[Dict[str, str]] = None) -> str:
    if not categories:
        return base_prompt
    cat_parts = []
    if categories.get('writing_style'): cat_parts.append(f"Gaya: {categories['writing_style']}")
    if categories.get('text_format'): cat_parts.append(f"Format: {categories['text_format']}")
    if categories.get('tone'): cat_parts.append(f"Nada: {categories['tone']}")
    if categories.get('audience'): cat_parts.append(f"Target: {categories['audience']}")
    if categories.get('language_level'): cat_parts.append(f"Tingkat: {categories['language_level']}")
    if cat_parts:
        return f"Gunakan kriteria: {', '.join(cat_parts)}\n\n{base_prompt}"
    return base_prompt

def build_generate_prompt(categories: Dict[str, str]) -> str:
    style = categories.get('writing_style', 'Ekspositori')
    tone = categories.get('tone', 'Formal')
    audience = categories.get('audience', 'Umum')
    fmt = categories.get('text_format', 'Prosa Murni')
    level = categories.get('language_level', 'Menengah')
    return f"""Buat narasi profesional berbahasa Indonesia dengan kriteria:
- Gaya: {style}
- Format: {fmt}
- Nada: {tone}
- Target Pembaca: {audience}
- Tingkat Bahasa: {level}

ATURAN PENTING - Analisis dan Format Teks:
1. **JUDUL/HEADING**: Jika ada bagian yang merupakan judul utama atau sub-judul, format sebagai heading dengan menulis di baris terpisah dan huruf besar di awal kata. Contoh: "Latar Belakang Masalah"
2. **POIN-POIN/DAFTAR**: Jika ada bagian yang berisi item-item, langkah-langkah, atau poin-poin, format sebagai daftar bernomor atau bullet. Gunakan format:
   - 1. 2. 3. untuk daftar berurutan
   - • untuk daftar tidak berurutan
3. **KALIMAT KUNCI/PENTING**: Jika ada kalimat atau frasa yang merupakan inti/poin penting, balut dengan tanda *asterisk* untuk italic. Contoh: *faktor utama yang mempengaruhi*.
4. **PARAGRAF BIASA**: Sisanya susun sebagai paragraf yang koheren dan runtut.
5. Pisahkan setiap section dengan baris kosong.
6. Pertahankan semua informasi penting dari teks asli.

Teks:
{{text}}

Narasi dengan format:"""

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
    result = call_gemini(prompt)
    return {"status": "success", "result": result.strip()}

@app.post("/api/ai/generate")
def generate_narrative(request: GenerateRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    prompt_template = build_generate_prompt(request.categories)
    prompt = build_dynamic_prompt(prompt_template.format(text=request.text), request.categories)
    result = call_gemini(prompt)
    return {"status": "success", "original": request.text, "result": result.strip(), "categories": request.categories}

@app.post("/api/ai/generate-web")
def generate_web(request: GenerateRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    style = request.categories.get('writing_style', 'Ekspositori')
    tone = request.categories.get('tone', 'Formal')
    audience = request.categories.get('audience', 'Umum')
    paragraphs = request.text.split('\n\n')
    if len(paragraphs) == 1:
        paragraphs = request.text.split('\n')
    content_html = ""
    for i, para in enumerate(paragraphs):
        para = para.strip()
        if not para: continue
        if i == 0 and len(para) < 100:
            content_html += f'<h1>{para}</h1>\n'
        elif para.startswith(('#', '•', '-', '1.', '2.', '3.', '4.', '5.')):
            content_html += f'<div class="highlight">{para}</div>\n'
        else:
            content_html += f'<p>{para}</p>\n'
    if not content_html:
        content_html = f'<p>{request.text}</p>'
    html = f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Narasi - {style}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.8;color:#333;background:#fafafa}}
.container{{max-width:720px;margin:0 auto;padding:40px 20px;background:white;min-height:100vh}}
h1{{font-size:2em;margin-bottom:24px;color:#1a1a1a;line-height:1.3}}
p{{margin-bottom:20px;font-size:1.1em;color:#444}}
.highlight{{background:linear-gradient(135deg,#f0f7ff,#e8f4fd);border-left:4px solid #3a7bd5;padding:16px 20px;margin:24px 0;border-radius:0 8px 8px 0;font-size:1.05em}}
.meta{{display:flex;gap:16px;margin-bottom:32px;padding-bottom:16px;border-bottom:1px solid #eee;font-size:0.85em;color:#888}}
.meta span{{background:#f0f7ff;padding:4px 12px;border-radius:20px;color:#3a7bd5}}
@media(max-width:600px){{.container{{padding:24px 16px}}h1{{font-size:1.6em}}p{{font-size:1em}}}}
</style>
</head>
<body>
<div class="container">
<div class="meta"><span>{style}</span><span>{tone}</span><span>{audience}</span></div>
{content_html}
</div>
</body></html>"""
    return {"status": "success", "html": html}

@app.post("/api/ai/generate-word")
def generate_word(request: GenerateRequest):
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Teks kosong")
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        import io
        from fastapi.responses import StreamingResponse
        doc = Document()
        style = doc.styles['Normal']
        font = style.font
        font.name = 'Calibri'
        font.size = Pt(11)
        title = doc.add_heading('Narasi Dokumen', 0)
        title.alignment = WD_ALIGN_PARAGRAPH.CENTER
        meta_para = doc.add_paragraph()
        meta_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        meta_run = meta_para.add_run(f'Gaya: {request.categories.get("writing_style", "")} | Nada: {request.categories.get("tone", "")} | Target: {request.categories.get("audience", "")}')
        meta_run.font.size = Pt(9)
        meta_run.font.color.rgb = RGBColor(128, 128, 128)
        doc.add_paragraph()
        paragraphs = request.text.split('\n\n')
        if len(paragraphs) == 1:
            paragraphs = request.text.split('\n')
        for i, para in enumerate(paragraphs):
            para = para.strip()
            if not para: continue
            if i == 0 and len(para) < 100:
                doc.add_heading(para, level=1)
            elif para.startswith('#'):
                doc.add_heading(para.lstrip('#').strip(), level=2)
            elif para.startswith(('•', '-', '*')):
                doc.add_paragraph(para.lstrip('•-* ').strip(), style='List Bullet')
            else:
                doc.add_paragraph(para)
        buffer = io.BytesIO()
        doc.save(buffer)
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": "attachment; filename=narasi-laporan.docx"})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal membuat file Word: {str(e)}")

@app.post("/api/ai/parse-file")
async def parse_file(file: UploadFile = File(...)):
    content = await file.read()
    filename = file.filename.lower()
    try:
        if filename.endswith('.txt'):
            text = content.decode('utf-8')
        elif filename.endswith('.docx'):
            import docx, io
            doc = docx.Document(io.BytesIO(content))
            text = '\n'.join([p.text for p in doc.paragraphs if p.text.strip()])
        elif filename.endswith('.xlsx'):
            import openpyxl, io
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
            parts = []
            for sheet in wb.sheetnames:
                for row in wb[sheet].iter_rows(values_only=True):
                    t = ' | '.join([str(c) for c in row if c is not None])
                    if t.strip(): parts.append(t)
            text = '\n'.join(parts)
        elif filename.endswith('.pdf'):
            from PyPDF2 import PdfReader
            import io
            reader = PdfReader(io.BytesIO(content))
            text = '\n'.join([p.extract_text() for p in reader.pages if p.extract_text()])
        elif filename.endswith('.pptx'):
            from pptx import Presentation
            import io
            prs = Presentation(io.BytesIO(content))
            text = '\n'.join([s.text for slide in prs.slides for s in slide.shapes if hasattr(s, "text") and s.text.strip()])
        else:
            raise HTTPException(status_code=400, detail="Format file tidak didukung")
        if not text.strip():
            raise HTTPException(status_code=400, detail="Tidak ada teks yang ditemukan")
        return {"status": "success", "filename": file.filename, "text": text.strip()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal membaca file: {str(e)}")

@app.post("/api/ai/ocr")
async def ocr_image(file: UploadFile = File(...)):
    raise HTTPException(status_code=501, detail="OCR belum tersedia, gunakan input teks atau file")

@app.post("/api/restart")
def restart_server():
    import subprocess, sys, os
    try:
        bat_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "restart-server.bat")
        subprocess.Popen(["cmd", "/c", "start", "", bat_path], shell=False)
        return {"status": "success", "message": "Server sedang restart..."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
