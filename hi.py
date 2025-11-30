import os
import time
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import fitz  # PyMuPDF

# --- Integrations ---
import firebase_admin
from firebase_admin import credentials, firestore
from supabase import create_client, Client

# --- Optional RAG (Will skip if not installed) ---
try:
    from langchain.text_splitter import CharacterTextSplitter
    from langchain_community.vectorstores import FAISS
    from langchain_community.embeddings import HuggingFaceEmbeddings
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

# =================================================================
#                     CONFIGURATION
# =================================================================

app = Flask(__name__)
CORS(app)

GROQ_API_KEY = os.getenv("GROQ_API_KEY") 
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# 2. Supabase Config (Updated to use os.getenv)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = None
try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Supabase Init Warning: {e}")

# 3. Firebase Config (Looks for serviceAccountKey.json in same folder)
SERVICE_ACCOUNT_PATH = os.path.join(os.getcwd(), "serviceAccountKey.json")
db = None

try:
    if not firebase_admin._apps:
        if os.path.exists(SERVICE_ACCOUNT_PATH):
            cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
            print("✅ Firebase Admin SDK Initialized.")
        else:
            print(f"⚠️ Warning: {SERVICE_ACCOUNT_PATH} not found. Reminders will fail.")
    else:
        db = firestore.client()
except Exception as e:
    print(f"❌ Firebase Init Error: {e}")

# 4. Local Storage
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'flask_uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# =================================================================
#                     HELPER FUNCTIONS
# =================================================================

def ask_groq(messages, model="llama-3.1-8b-instant", temperature=0.5):
    """Generic wrapper for Groq API"""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    if isinstance(messages, str):
        messages = [{"role": "user", "content": messages}]
        
    data = {
        "model": model,
        "messages": messages,
        "temperature": temperature
    }
    try:
        response = requests.post(GROQ_API_URL, headers=headers, json=data)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"AI Error: {e}")
        return f"AI Service Unavailable: {str(e)}"

def extract_text_from_pdf_stream(file_stream):
    try:
        doc = fitz.open(stream=file_stream, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    except Exception as e:
        return ""

# =================================================================
#                     ROUTES
# =================================================================

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')

@app.route('/login')
def serve_login():
    return send_from_directory('.', 'login.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)

# --- 1. Login ---
@app.route('/api/login', methods=['POST'])
def login_verify():
    data = request.json
    if data.get('password') == "admin":
        return jsonify({"status": "success", "redirect": "/"})
    return jsonify({"error": "Invalid Credentials"}), 401

# --- 2. Fee Finder ---
@app.route('/api/fee_finder', methods=['POST'])
def fee_finder():
    user_prompt = request.json.get('prompt')
    system_context = "You are a legal fee estimator for India. Breakdown costs (Retainer, Hourly, Flat) in INR. Disclaimer: Not legal advice."
    response = ask_groq([{"role": "system", "content": system_context}, {"role": "user", "content": user_prompt}])
    return jsonify({"response": response})

# --- 3. Case Simulator ---
@app.route('/api/case_simulate', methods=['POST'])
def case_simulate():
    description = request.form.get('case_description', '')
    doc_text = ""
    if 'files' in request.files:
        doc_text = extract_text_from_pdf_stream(request.files['files'].read())

    full_context = description + "\n\n" + doc_text

    # RAG Logic (Optional)
    context_block = full_context
    if RAG_AVAILABLE and len(full_context) > 500:
        try:
            text_splitter = CharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
            split_docs = text_splitter.split_text(full_context)
            embeddings = HuggingFaceEmbeddings()
            vector_store = FAISS.from_texts(split_docs, embeddings)
            retrieved = vector_store.similarity_search(description, k=2)
            context_block = "\n".join([d.page_content for d in retrieved])
        except:
            pass # Fallback to full context if RAG fails

    prompt = f"""
    Analyze this Indian Legal Case:
    {description}
    
    Context:
    {context_block[:10000]}
    
    Provide:
    1. Win Probability (High/Medium/Low)
    2. Key Strengths
    3. Weaknesses
    4. Relevant Acts
    """
    response = ask_groq(prompt)
    return jsonify({"prediction": "Done", "response": response})

# --- 4. Law Advisor (NO WEB SCRAPING - PURE AI) ---
@app.route('/api/law_advice', methods=['POST'])
def law_advice():
    query = request.json.get('query')
    
    # We make 3 fast AI calls to structure the data exactly how the frontend expects it.
    # This is much faster and more reliable than scraping.

    # 1. Get the Article Name
    article_prompt = f"Identify the specific Indian Constitution Article, IPC Section, or Act relevant to: '{query}'. Return ONLY the name (e.g., 'Article 21' or 'Section 302 IPC'). Do not add extra text."
    article = ask_groq(article_prompt).replace('"', '').replace("'", "")

    # 2. Get the Law Text
    text_prompt = f"Provide the official legal text or a brief formal summary for {article}. Keep it under 40 words."
    law_text = ask_groq(text_prompt)

    # 3. Get the Advice
    advice_prompt = f"User Query: {query}\nRelevant Law: {article}\n\nProvide clear, actionable legal advice for the user based on Indian Law."
    advice = ask_groq(advice_prompt)

    return jsonify({
        "article": article,
        "law_text": law_text,
        "advice": advice
    })

# --- 5. PDF Summarizer ---
@app.route('/api/pdf_summary', methods=['POST'])
def pdf_summary():
    if 'pdf' not in request.files: return jsonify({"error": "No file"}), 400
    text = extract_text_from_pdf_stream(request.files['pdf'].read())
    
    if not text.strip(): return jsonify({"response": "Error: Empty or scanned PDF."})

    response = ask_groq(f"Summarize this legal document:\n{text[:10000]}")
    return jsonify({"summary": "Done", "response": response})

# --- 6. Reminders (Firebase) ---
@app.route('/reminders/save-case-local', methods=['POST'])
def save_case_reminder():
    if not db: return jsonify({"error": "Firebase Not Connected"}), 500
    data = request.get_json()
    try:
        db.collection("case_reminders").add({
            "title": data.get('case_title'),
            "description": data.get('description'),
            "internal_due_date": data.get('due_date'),
            "user_email": data.get('user_email'),
            "sender_email": data.get('sender_email'),
            "created_at": firestore.SERVER_TIMESTAMP,
            "status": "Scheduled",
            "reminder_sent": False
        })
        return jsonify({"message": "Saved"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- 7. Document Locker (Supabase/Local) ---
@app.route('/api/pdf_lock', methods=['POST'])
def pdf_lock():
    if 'pdf' not in request.files: return jsonify({"error": "No file"}), 400
    file = request.files['pdf']
    filename = file.filename
    file_bytes = file.read()
    
    if supabase:
        try:
            supabase.storage.from_("lawlock").upload(filename, file_bytes, {"content-type": "application/pdf", "x-upsert": "true"})
            return jsonify({"message": "Vaulted in Cloud", "filename": filename})
        except: pass
    
    with open(os.path.join(UPLOAD_FOLDER, filename), 'wb') as f: f.write(file_bytes)
    return jsonify({"message": "Vaulted Locally", "filename": filename})

@app.route('/api/documents', methods=['GET'])
def list_documents():
    docs = []
    if supabase:
        try:
            for f in supabase.storage.from_("lawlock").list():
                docs.append({"name": f['name'], "created_at": f['created_at']})
        except: pass
    if os.path.exists(UPLOAD_FOLDER):
        for f in os.listdir(UPLOAD_FOLDER):
            if f.endswith('.pdf'):
                docs.append({"name": f, "created_at": time.ctime(os.path.getmtime(os.path.join(UPLOAD_FOLDER, f)))})
    return jsonify(docs)

if __name__ == '__main__':
    app.run(debug=True, port=5000)