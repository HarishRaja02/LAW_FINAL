// --- Configuration ---
const API_BASE_URL = "http://localhost:5000";

// Initialize Icons
lucide.createIcons();

// --- Tab Navigation Logic ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.getElementById('header-title').innerText = tabId.replace('_', ' ');

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('bg-white/5', 'text-white', 'shadow-inner', 'border', 'border-white/5');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-white/5');
        const indicator = btn.querySelector('.active-indicator');
        if(indicator) indicator.remove();
        const icon = btn.querySelector('i');
        if(icon) icon.classList.replace('text-blue-400', 'text-slate-500');
    });

    const activeBtn = document.getElementById(`nav-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-white/5');
        activeBtn.classList.add('bg-white/5', 'text-white', 'shadow-inner', 'border', 'border-white/5');
        
        const line = document.createElement('div');
        line.className = "active-indicator absolute left-0 top-0 w-[2px] h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]";
        activeBtn.appendChild(line);

        const icon = activeBtn.querySelector('i');
        if(icon) icon.classList.replace('text-slate-500', 'text-blue-400');
    }
}

// --- Helper: Advanced Markdown Formatter ---
function formatMarkdown(text) {
    // Uses the 'marked' library if available, otherwise falls back to simple text
    if (typeof marked !== 'undefined') {
        return marked.parse(text);
    }
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

// --- 1. Fee Finder Logic ---
document.getElementById('fee-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('fee-input').value;
    if (!input) return;

    document.getElementById('fee-placeholder').classList.add('hidden');
    document.getElementById('fee-content').classList.add('hidden');
    document.getElementById('fee-loading').classList.remove('hidden');
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/fee_finder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: input }),
        });
        const data = await response.json();
        
        document.getElementById('fee-loading').classList.add('hidden');
        const contentDiv = document.getElementById('fee-content');
        contentDiv.innerHTML = formatMarkdown(data.response);
        contentDiv.classList.remove('hidden');
        document.getElementById('fee-result-badge').classList.remove('hidden');
    } catch (error) {
        document.getElementById('fee-loading').classList.add('hidden');
        document.getElementById('fee-content').innerText = "Error: Could not connect to API.";
        document.getElementById('fee-content').classList.remove('hidden');
    }
});

// --- 2. Case Predictor Logic ---
const predictorFile = document.getElementById('predictor-file');
predictorFile.addEventListener('change', (e) => {
    if(e.target.files[0]) {
        document.getElementById('predictor-filename').innerText = e.target.files[0].name;
    }
});

document.getElementById('predictor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const desc = document.getElementById('predictor-desc').value;
    const file = predictorFile.files[0];
    
    if(!desc && !file) return;

    const btn = document.getElementById('predictor-btn');
    const originalText = btn.innerText;
    btn.innerText = "Simulating Court Outcome...";
    btn.disabled = true;

    document.getElementById('predictor-placeholder').classList.add('hidden');
    
    try {
        const formData = new FormData();
        formData.append('case_description', desc);
        if (file) formData.append('files', file);

        const response = await fetch(`${API_BASE_URL}/api/case_simulate`, {
            method: 'POST',
            body: formData,
        });
        const data = await response.json();

        const contentDiv = document.getElementById('predictor-content');
        contentDiv.innerHTML = formatMarkdown(data.response || data.prediction);
        contentDiv.classList.remove('hidden');
    } catch (error) {
        alert("Prediction Error. Check console.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// --- 3. Law Advisor Logic ---
document.getElementById('advisor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('advisor-input');
    const query = inputEl.value;
    if(!query) return;

    const history = document.getElementById('chat-history');
    document.getElementById('chat-empty').classList.add('hidden');

    const userBubble = `
        <div class="flex justify-end animate-fade-in">
            <div class="flex items-end max-w-3xl space-x-3 flex-row-reverse space-x-reverse">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-slate-800 border-slate-700">
                    <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
                </div>
                <div class="p-5 rounded-2xl text-sm leading-relaxed shadow-lg bg-slate-800 text-slate-200 rounded-br-none border border-slate-700">
                    <p>${query}</p>
                </div>
            </div>
        </div>
    `;
    history.insertAdjacentHTML('beforeend', userBubble);
    lucide.createIcons();
    inputEl.value = '';
    history.scrollTop = history.scrollHeight;

    try {
        const response = await fetch(`${API_BASE_URL}/api/law_advice`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });
        const data = await response.json();

        const botBubble = `
            <div class="flex justify-start animate-fade-in mt-4">
                <div class="flex items-end max-w-3xl space-x-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-amber-900/20 border-amber-500/20">
                         <i data-lucide="sparkles" class="w-3.5 h-3.5 text-amber-500"></i>
                    </div>
                    <div class="p-5 rounded-2xl text-sm leading-relaxed shadow-lg glass-panel rounded-bl-none border-slate-700/50">
                        <div class="space-y-5">
                            ${data.article ? `
                            <div class="relative overflow-hidden rounded-xl border border-amber-900/40 bg-gradient-to-r from-amber-950/40 to-transparent">
                                <div class="absolute left-0 top-0 w-1 h-full bg-amber-600"></div>
                                <div class="p-4 pl-6">
                                    <h4 class="text-amber-400 font-serif font-bold text-lg mb-2">${data.article}</h4>
                                    <p class="text-amber-100/70 text-sm italic font-serif leading-relaxed">"${data.law_text}"</p>
                                </div>
                            </div>` : ''}
                            <div class="text-slate-300 prose prose-invert prose-sm max-w-none">
                                ${formatMarkdown(data.advice || data.explanation)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        history.insertAdjacentHTML('beforeend', botBubble);
        lucide.createIcons();
        history.scrollTop = history.scrollHeight;

    } catch (e) {
        alert("Advisor Error");
    }
});

// --- 4. PDF Summarizer Logic ---
const pdfInput = document.getElementById('pdf-upload-input');
const pdfBtn = document.getElementById('pdf-analyze-btn');

pdfInput.addEventListener('change', (e) => {
    if(e.target.files[0]) {
        document.getElementById('pdf-filename').innerText = e.target.files[0].name;
        document.getElementById('pdf-upload-label').classList.add('bg-indigo-900/20', 'border-indigo-500');
        pdfBtn.disabled = false;
    }
});

pdfBtn.addEventListener('click', async () => {
    const file = pdfInput.files[0];
    if(!file) return;

    pdfBtn.innerText = "Analyzing Content...";
    try {
        const formData = new FormData();
        formData.append('pdf', file);
        
        const response = await fetch(`${API_BASE_URL}/api/pdf_summary`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
       // NEW CODE (Fixes the issue)
// We prioritize 'data.response' because that contains the AI's full analysis
document.getElementById('pdf-output').innerHTML = `<div class="prose prose-invert max-w-none">${formatMarkdown(data.response)}</div>`;
    } catch (e) {
        document.getElementById('pdf-output').innerText = "Analysis Failed.";
    } finally {
        pdfBtn.innerText = "Summarize Document";
    }
});

// --- 5. Document Locker (Supabase) ---
const lockerInput = document.getElementById('locker-input');
const lockerBtn = document.getElementById('locker-btn');

lockerInput.addEventListener('change', (e) => {
    if(e.target.files[0]) {
        document.getElementById('locker-filename').innerText = e.target.files[0].name;
        lockerBtn.disabled = false;
    }
});

lockerBtn.addEventListener('click', async () => {
    const file = lockerInput.files[0];
    if(!file) return;

    lockerBtn.innerHTML = `<i class="animate-spin w-4 h-4 mr-2" data-lucide="loader"></i> Encrypting...`;
    
    const formData = new FormData();
    formData.append('pdf', file);

    try {
        const response = await fetch(`${API_BASE_URL}/api/pdf_lock`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        document.getElementById('locker-msg').innerHTML = `<span class="text-emerald-400">${data.message}</span>`;
        document.getElementById('locker-msg').classList.remove('hidden');
        fetchDocuments(); 
    } catch (e) {
        alert("Upload failed");
    } finally {
        lockerBtn.innerHTML = `<i data-lucide="shield" class="w-4 h-4 mr-2"></i> Vault Document`;
        lucide.createIcons();
    }
});

async function fetchDocuments() {
    const list = document.getElementById('locker-list');
    try {
        const response = await fetch(`${API_BASE_URL}/api/documents`);
        const files = await response.json();
        
        list.innerHTML = files.map(f => `
            <div class="flex items-center justify-between p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 hover:border-indigo-500/50 transition-colors group">
                <div class="flex items-center space-x-3">
                    <div class="p-2 bg-indigo-500/10 rounded-lg">
                        <i data-lucide="file-text" class="w-4 h-4 text-indigo-400"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-white">${f.name}</p>
                        <p class="text-[10px] text-slate-500">${new Date(f.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <button class="text-slate-500 hover:text-white transition-colors"><i data-lucide="download" class="w-4 h-4"></i></button>
            </div>
        `).join('');
        lucide.createIcons();
    } catch (e) {
        list.innerHTML = `<div class="text-center text-slate-500 mt-10">Vault Empty or Connection Error</div>`;
    }
}
// Load docs on start
fetchDocuments();

// --- 6. Case Reminder (Firebase) ---
document.getElementById('reminder-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Updated payload to match Python backend keys
    const payload = {
        case_title: document.getElementById('rem-title').value,
        due_date: document.getElementById('rem-date').value,
        user_email: document.getElementById('rem-recipient').value, 
        sender_email: document.getElementById('rem-sender').value,
        description: document.getElementById('rem-notes').value
    };

    const btn = e.target.querySelector('button');
    const oldText = btn.innerHTML;
    btn.innerHTML = "Saving...";

    try {
        const response = await fetch(`${API_BASE_URL}/reminders/save-case-local`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        
        if(response.ok) {
            alert("Reminder Saved to Database!");
            e.target.reset();
        } else {
            const err = await response.json();
            alert("Error: " + err.error);
        }
    } catch(err) {
        alert("Connection Error. Is Backend Running?");
    } finally {
        btn.innerHTML = oldText;
        lucide.createIcons();
    }
});