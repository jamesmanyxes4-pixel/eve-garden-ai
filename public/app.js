/* EVE GARDEN AI frontend logic */
const $ = s => document.querySelector(s);
const api = async (p, o = {}) => {
  const r = await fetch('/api' + p, { ...o, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(o.headers || {}) } });
  const j = await r.json();
  if (r.status === 401 && token) { logout(); throw new Error('Signed out'); }
  if (!r.ok) throw new Error(j.error || 'Request failed');
  return j;
};
let token = localStorage.getItem('evetok') || '';
let user = null, agents = [], curAgent = null, view = 'home';
const AV = ['/agents/agent1.jpg','/agents/agent2.jpg','/agents/agent3.jpg','/agents/agent4.jpg','/agents/agent5.jpg','/agents/agent6.jpg','/agents/agent7.jpg','/agents/agent8.jpg','/agents/agent9.jpg'];
const MODELS = ['openai/gpt-oss-120b','gemini-2.0-flash','gemini-1.5-flash','openai/gpt-oss-20b'];
const TOOLS = ['browser','terminal','fileManager','imageGenerator','codeEditor','knowledgeBase','search','api'];

/* ---------- landing orbit ---------- */
const AG = [
  { n: 'Coding Agent', m: 'GPT-OSS 120B', i: 0 }, { n: 'Research Agent', m: 'GPT-OSS 120B', i: 1 },
  { n: 'Business Agent', m: 'GPT-OSS 120B', i: 2 }, { n: 'Design Agent', m: 'Gemini 2.0 Flash', i: 3 },
  { n: 'Security Agent', m: 'GPT-OSS 120B', i: 4 }, { n: 'Automation Agent', m: 'GPT-OSS 120B', i: 5 },
  { n: 'Marketing Agent', m: 'GPT-OSS 120B', i: 6 }, { n: 'Data Agent', m: 'Gemini 2.0 Flash', i: 7 },
  { n: 'Support Agent', m: 'GPT-OSS 120B', i: 8 }
];
function buildOrbit() {
  const o = $('#orbitCards'); const R = 200;
  AG.forEach((a, k) => {
    const d = document.createElement('div');
    d.className = 'acard';
    
    d.innerHTML = `<img src="${AV[a.i]+"?f=2"}" alt="${a.n}"><div class="nm">${a.n}</div><div class="st"><span class="on">● Online</span></div><div class="st">${a.m}</div><div class="mdl">⚡ ${a.m}</div>`;
    o.appendChild(d);
  });
}
function buildMarket() {
  api('/marketplace').then(j => {
    const list = j.agents.length ? j.agents : AG.map(a => ({ name: a.n, desc: 'Specialist agent', img: AV[a.i]+"?f=2", model: a.m }));
    $('#marketGrid').innerHTML = list.map(a => `<div class="agent-card"><img src="${a.img}?f=2"><div class="nm">${a.name}</div><div class="ds">${a.desc || 'Specialist agent'}</div><div class="meta"><span class="pill">⚡ ${a.model}</span><span class="pill on">● Online</span></div></div>`).join('');
  }).catch(() => {});
}

/* ---------- auth ---------- */
let mode = 'login';
function showAuth(m) {
  mode = m;
  $('#landing').classList.add('hidden'); $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden'); $('#verifyBox').classList.add('hidden'); $('#authForm').classList.remove('hidden');
  $('#authMsg').className = 'msg hidden';
  $('#fName').style.display = m === 'signup' ? 'block' : 'none';
  $('#authTitle').textContent = m === 'signup' ? 'Create your account' : m === 'forgot' ? 'Reset password' : 'Welcome back';
  $('#authBtn').textContent = m === 'signup' ? 'Create Account' : m === 'forgot' ? 'Send Reset Link' : 'Sign in';
  $('#authAlt').innerHTML = m === 'signup' ? `Have an account? <a onclick="showAuth('login')">Sign in</a>` : `New here? <a onclick="showAuth('signup')">Create account</a>${m !== 'forgot' ? ' · <a onclick="showAuth(\'forgot\')">Forgot password</a>' : ''}`;
}
async function doAuth() {
  const email = $('#fEmail').value.trim(), password = $('#fPass').value, name = $('#fName').value.trim();
  const msg = $('#authMsg'); msg.className = 'msg'; msg.textContent = '...';
  try {
    if (mode === 'signup') {
      const j = await api('/signup', { method: 'POST', body: JSON.stringify({ email, password, name }) });
      $('#authForm').classList.add('hidden'); $('#verifyBox').classList.remove('hidden');
      $('#verifyBtn').onclick = async () => {
        await api('/verify', { method: 'POST', body: JSON.stringify({ token: j.verifyToken }) });
        showAuth('login'); msg.className = 'msg ok'; msg.textContent = '✓ Verified! You can sign in now.';
      };
    } else if (mode === 'forgot') {
      const j = await api('/forgot', { method: 'POST', body: JSON.stringify({ email }) });
      msg.className = 'msg ok'; msg.textContent = 'If that account exists, a reset link was created.';
      if (j.resetToken) msg.innerHTML += `<br><a onclick="resetWith('${j.resetToken}')">Open reset link</a>`;
    } else {
      const j = await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      token = j.token; localStorage.setItem('evetok', token); enterApp(j.user);
    }
  } catch (e) { msg.className = 'msg err'; msg.textContent = e.message; }
}
async function resetWith(t) {
  const p = prompt('New password:'); if (!p) return;
  try { await api('/reset', { method: 'POST', body: JSON.stringify({ token: t, password: p }) }); showAuth('login'); } catch (e) { alert(e.message); }
}
function logout() { token = ''; localStorage.removeItem('evetok'); $('#app').classList.add('hidden'); $('#auth').classList.add('hidden'); $('#landing').classList.remove('hidden'); }

/* ---------- app shell ---------- */
async function enterApp(u) {
  user = u;
  $('#auth').classList.add('hidden'); $('#landing').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#uName').textContent = u.email;
  await loadAgents(); go('home');
}
async function loadAgents() { agents = (await api('/agents')).agents; }
function go(v) {
  view = v;
  document.querySelectorAll('.side nav a').forEach(a => a.classList.toggle('on', a.dataset.v === v));
  const m = $('#main');
  if (v === 'home') { m.innerHTML = homeView(); statCards(); }
  else if (v === 'agents') { m.innerHTML = agentsView(); }
  else if (v === 'files') filesPage();
  else if (v === 'kb') kbPage();
  else if (v === 'market2') marketPage();
  else if (v === 'workflows') workflowsPage();
  else if (v === 'settings') settingsPage();
  else if (v === 'api') m.innerHTML = apiPage();
  else m.innerHTML = `<div class="top"><h2>${v[0].toUpperCase() + v.slice(1)}</h2></div><div class="panel hint">Coming online.</div>`;
}

/* ---------- views ---------- */
function homeView() {
  const online = agents.filter(a => true).length;
  return `<div class="top"><h2>Welcome, ${user.name}</h2><button class="btn primary" style="margin-left:auto" onclick="createAgentForm()">+ Create Agent</button></div>
  <div class="grid">
    <div class="agent-card"><div class="nm">Active Agents</div><div style="font-size:30px;font-weight:800">${agents.length}</div><div class="ds">Specialists in your garden</div></div>
    <div class="agent-card"><div class="nm">Total Memory</div><div style="font-size:30px;font-weight:800">${agents.reduce((s, a) => s + (a.memorySize || 0), 0)}</div><div class="ds">Messages remembered</div></div>
    <div class="agent-card"><div class="nm">Recently Active</div><div style="font-size:30px;font-weight:800">${online}</div><div class="ds">Agents ready to work</div></div>
  </div>
  <div class="top" style="margin-top:26px"><h2>Your Agents</h2></div>
  <div class="grid" id="dashAgents">${agents.slice(0, 6).map(agentCard).join('')}</div>`;
}
function agentCard(a) {
  return `<div class="agent-card" onclick="openAgent('${a.id}')">
    <img src="${a.img}?f=2" alt="${a.name}"><div class="nm">${a.name}</div><div class="ds">${a.desc || ''}</div>
    <div class="meta"><span class="pill">⚡ ${a.model}</span><span class="pill">🧠 ${a.memorySize || 0}</span><span class="pill on">● Online</span></div>
    <button class="btn primary" style="margin-top:12px;width:100%">Open</button></div>`;
}
function agentsView() {
  return `<div class="top"><h2>Agents</h2><button class="btn primary" style="margin-left:auto" onclick="createAgentForm()">+ Create Agent</button></div>
  <div class="grid">${agents.map(agentCard).join('') || '<div class="panel hint">No agents yet — create your first one.</div>'}</div>`;
}
function createAgentForm() {
  const m = $('#main');
  m.innerHTML = `<div class="top"><h2>Create Agent</h2></div>
  <div class="panel" style="max-width:640px">
    <input id="cgName" class="in" placeholder="Agent Name"><textarea id="cgDesc" class="in" rows="2" placeholder="Agent Description"></textarea>
    <textarea id="cgPers" class="in" rows="2" placeholder="Personality (e.g. professional, focused, friendly)"></textarea>
    <textarea id="cgIns" class="in" rows="3" placeholder="Instructions (what the agent should always do)"></textarea>
    <div class="row"><select id="cgModel" class="in" style="width:auto">${MODELS.map(x => `<option>${x}</option>`).join('')}</select>
      <select id="cgImg" class="in" style="width:auto">${AV.map((v, i) => `<option value="${i}">Avatar ${i + 1}</option>`).join('')}</select></div>
    <div class="row" style="gap:20px;margin:8px 0">
      <label class="chk"><input type="checkbox" id="cgMem" checked> Memory Enabled</label>
      <label class="chk"><input type="checkbox" id="cgVoice"> Voice Enabled</label>
      <label class="chk"><input type="checkbox" id="cgVis" checked> Vision Enabled</label></div>
    <div style="font-size:13px;font-weight:700;margin:10px 0 4px">Choose Tools</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 20px">${TOOLS.map(t => `<label class="chk"><input type="checkbox" class="cgTool" value="${t}" ${['browser', 'terminal', 'knowledgeBase'].includes(t) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
    <button class="btn primary wide" style="margin-top:14px" onclick="saveAgent()">Create Agent</button>
  </div>`;
}
async function saveAgent() {
  try {
    await api('/agents', { method: 'POST', body: JSON.stringify({
      name: $('#cgName').value, desc: $('#cgDesc').value, personality: $('#cgPers').value,
      instructions: $('#cgIns').value, model: $('#cgModel').value, img: AV[$('#cgImg').value],
      memory: $('#cgMem').checked, voice: $('#cgVoice').checked, vision: $('#cgVis').checked,
      tools: [...document.querySelectorAll('.cgTool:checked')].map(x => x.value)
    }) });
    await loadAgents(); go('agents');
  } catch (e) { alert(e.message); }
}

/* ---------- workspace ---------- */
const TOOL_LABEL = { browser: '🌐 Browser', terminal: '⌨ Terminal', fileManager: '📁 Files', imageGenerator: '🎨 Image Gen', codeEditor: '🛠 Code Editor', knowledgeBase: '📚 Knowledge', search: '🔎 Search', api: '⚡ API Access' };
async function openAgent(id) {
  curAgent = agents.find(a => a.id === id);
  const a = curAgent;
  $('#main').innerHTML = `<div class="top"><h2>${a.name}</h2><button class="btn" onclick="go('agents')">← Back</button></div>
  <div class="ws">
    <div class="col info">
      <img class="ws-img" src="${a.img}?f=2"><h3>${a.name}</h3><div class="hint">${a.desc || ''}</div>
      <div style="margin-top:12px">
        <div class="stat"><span>Status</span><span style="color:var(--ok)">● Online</span></div>
        <div class="stat"><span>Model</span><span>${a.model}</span></div>
        <div class="stat"><span>Memory</span><span>${a.memorySize || 0} msgs</span></div>
        <div class="stat"><span>Memory</span><span>${a.memory ? 'Enabled' : 'Off'}</span></div>
      </div>
      <div style="font-size:12px;font-weight:700;margin:12px 0 4px">Memory Facts</div>
      <div id="memList" class="klist"></div>
      <div class="row" style="margin-top:6px"><input id="memAdd" class="in" placeholder="Teach: prefers dark UI"><button class="btn" onclick="addFact()">+</button></div>
      <button class="btn" style="margin-top:12px;width:100%" onclick="deleteAgent()">Delete Agent</button>
    </div>
    <div class="col chat">
      <div class="chatlog" id="chatlog"></div>
      <div class="chatin"><input id="chatIn" class="in" style="margin:0" placeholder="Message ${a.name}..." onkeydown="if(event.key==='Enter')sendMsg()"><button class="btn primary" onclick="sendMsg()">Send</button></div>
    </div>
    <div class="col tools">${toolPanel(a)}</div>
  </div>`;
  loadChat(); loadFacts(); bindTools();
}
function toolPanel(a) {
  return `<div class="tabs">${(a.tools || []).map((t, i) => `<div class="tab ${i === 0 ? 'on' : ''}" onclick="toolTab(this)">${TOOL_LABEL[t] || t}</div>`).join('') || '<div class="tab on">No tools</div>'}</div>
  <div style="flex:1;overflow-y:auto;padding:12px" id="toolBody">${(a.tools || [])[0] ? toolContent(a.tools[0]) : '<div class="hint">No tools enabled.</div>'}</div>`;
}
function toolContent(t) {
  if (t === 'browser' || t === 'search') return `<div class="urlbar"><input id="urlIn" placeholder="Enter URL or search..."><button class="btn" onclick="browseGo()">Go</button></div><iframe id="frame" sandbox="allow-scripts" src="https://example.com"></iframe>`;
  if (t === 'terminal') return `<div style="flex:1;background:#0a0e13;padding:10px;overflow-y:auto" id="termOut"></div><div class="chatin"><input id="termIn" class="in" style="margin:0;font-family:ui-monospace" placeholder="npm, node, python, git..." onkeydown="if(event.key==='Enter')termRun()"><button class="btn" onclick="termRun()">▶</button></div>`;
  if (t === 'fileManager') return `<div class="row" style="padding:6px 0"><select id="fFolder" class="in" style="width:auto;margin:0">${['Projects', 'Downloads', 'Uploads', 'Knowledge'].map(f => `<option>${f}</option>`).join('')}</select><input type="file" id="fUp" style="display:none" onchange="upFile()"><button class="btn" onclick="$('#fUp').click()">Upload</button></div><div id="flList" class="klist"></div>`;
  if (t === 'codeEditor') return `<select id="edFile" class="in" onchange="edOpen()" style="width:auto">${['index.html', 'style.css', 'app.js', 'main.py'].map(f => `<option>${f}</option>`).join('')}</select><textarea id="edBody" class="in" style="height:55%;font-family:ui-monospace"></textarea><div class="row"><button class="btn" onclick="edSave()">Save</button><button class="btn" onclick="edPreview()">Live Preview</button></div><iframe id="edPrev" style="flex:1;background:#fff;border-radius:8px;margin-top:8px"></iframe>`;
  if (t === 'knowledgeBase') return `<div class="row"><input type="file" id="kbUp" style="display:none" onchange="kbUpload()"><button class="btn" onclick="$('#kbUp').click()">Upload Doc</button></div><div id="kbList" class="klist" style="margin-top:8px"></div>`;
  if (t === 'imageGenerator') return `<input id="imgPrompt" class="in" placeholder="Describe the image..."><button class="btn primary" onclick="genImage()">Generate</button><div id="imgOut" style="margin-top:10px"></div>`;
  return `<div class="hint">Agent connects to external APIs here.</div>`;
}
function toolTab(el) {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); el.classList.add('on');
  const t = el.textContent.replace(/^[^A-Za-z]*/, '').replace(/^[A-Za-z ]+/, m => TOOLS.find(x => TOOL_LABEL[x].includes(el.textContent.trim()) && x) || '');
  const tool = TOOLS.find(x => TOOL_LABEL[x] === el.textContent.trim());
  $('#toolBody').innerHTML = toolContent(tool); bindTools();
}
function bindTools() {
  const a = curAgent;
  if ((a.tools || []).includes('fileManager')) listFiles();
  if ((a.tools || []).includes('knowledgeBase')) listKB();
}

/* chat */
async function loadChat() {
  const j = await api(`/agents/${curAgent.id}/messages`);
  $('#chatlog').innerHTML = j.messages.map(m => `<div class="bub ${m.role === 'user' ? 'user' : 'bot'}">${esc(m.content)}</div>`).join('');
  $('#chatlog').scrollTop = 9e9;
}
const esc = s => (s || '').replace(/</g, '&lt;');
async function sendMsg() {
  const inp = $('#chatIn'); const msg = inp.value.trim(); if (!msg) return;
  inp.value = '';
  $('#chatlog').insertAdjacentHTML('beforeend', `<div class="bub user">${esc(msg)}</div><div class="bub bot" id="thinking">…</div>`);
  $('#chatlog').scrollTop = 9e9;
  try {
    const j = await api(`/agents/${curAgent.id}/chat`, { method: 'POST', body: JSON.stringify({ message: msg }) });
    $('#thinking').textContent = j.reply;
    if (j.toolResult) $('#chatlog').insertAdjacentHTML('beforeend', `<div class="bub tool">${esc(j.toolResult)}</div>`);
  } catch (e) { $('#thinking').textContent = 'Error: ' + e.message; }
  $('#chatlog').scrollTop = 9e9; loadFacts();
}

/* memory facts */
async function loadFacts() {
  const j = await api(`/agents/${curAgent.id}/memory`);
  $('#memList').innerHTML = j.facts.map(f => `<div class="fl"><span class="nm">• ${esc(f.text)}</span></div>`).join('') || '<div class="hint">No facts yet. The agent learns as you chat.</div>';
}
async function addFact() {
  const t = $('#memAdd').value.trim(); if (!t) return;
  await api(`/agents/${curAgent.id}/memory`, { method: 'POST', body: JSON.stringify({ text: t }) });
  $('#memAdd').value = ''; loadFacts();
}
async function deleteAgent() {
  if (!confirm('Delete this agent?')) return;
  await api(`/agents/${curAgent.id}`, { method: 'DELETE' }); await loadAgents(); go('agents');
}

/* tools impl */
async function browseGo() {
  const u = $('#urlIn').value.trim();
  if (/^https?:/.test(u)) $('#frame').src = u; else $('#frame').src = 'https://duckduckgo.com/?q=' + encodeURIComponent(u);
}
let filesCache = [];
async function listFiles() {
  filesCache = (await api('/files')).files;
  const f = $('#flList'); if (!f) return;
  f.innerHTML = filesCache.map(x => `<div class="fl"><span class="nm">${esc(x.name)}</span><span class="badge">${x.folder}</span><span class="x" onclick="delFile('${x.id}')">✕</span></div>`).join('') || '<div class="hint">No files yet.</div>';
}
async function upFile() {
  const inp = $('#fUp'); if (!inp.files[0]) return;
  const fd = new FormData(); fd.append('file', inp.files[0]); fd.append('folder', $('#fFolder').value);
  await fetch('/api/files', { method: 'POST', body: fd, headers: { Authorization: 'Bearer ' + token } });
  listFiles();
}
async function delFile(id) { await api('/files/' + id, { method: 'DELETE' }); listFiles(); }
let kbCache = [];
async function listKB() {
  kbCache = (await api(`/agents/${curAgent.id}/kb`)).docs;
  const l = $('#kbList'); if (!l) return;
  l.innerHTML = kbCache.map(d => `<div class="kitem"><span class="nm">📄 ${esc(d.name)}</span><span class="x" onclick="delKB('${d.id}')">✕</span></div>`).join('') || '<div class="hint">No documents yet.</div>';
}
async function kbUpload() {
  const f = $('#kbUp').files[0]; if (!f) return;
  const text = await f.text();
  await api(`/agents/${curAgent.id}/kb`, { method: 'POST', body: JSON.stringify({ name: f.name, text: text.slice(0, 200000) }) });
  listKB();
}
async function delKB(id) { await api(`/agents/${curAgent.id}/kb/${id}`, { method: 'DELETE' }); listKB(); }
async function termRun() {
  const i = $('#termIn'); if (!i.value.trim()) return;
  $('#termOut').insertAdjacentHTML('beforeend', `<div class="termline">$ ${esc(i.value)}</div>`);
  i.value = '';
}
let edText = { 'index.html': '<h1>Hello from EVE GARDEN</h1>', 'style.css': 'h1{color:#3B82F6}', 'app.js': 'console.log(1)', 'main.py': 'print("hi")' };
function edOpen() { $('#edBody').value = edText[$('#edFile').value] || ''; }
function edSave() { edText[$('#edFile').value] = $('#edBody').value; }
function edPreview() { edSave(); $('#edPrev').srcdoc = edText['index.html'] + '<style>' + edText['style.css'] + '</style>'; }
async function genImage() {
  const p = $('#imgPrompt').value; if (!p) return;
  $('#imgOut').innerHTML = '<div class="hint">Generating…</div>';
  try {
    const r = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=512&height=512&nologo=true`);
    const b = await r.blob();
    $('#imgOut').innerHTML = `<img src="${URL.createObjectURL(b)}" style="width:100%;border-radius:10px">`;
  } catch (e) { $('#imgOut').innerHTML = '<div class="hint">Generation failed.</div>'; }
}

/* pages */
function filesPage() {
  $('#main').innerHTML = `<div class="top"><h2>Files</h2><input type="file" id="gUp" style="display:none" onchange="gUp()"><button class="btn primary" style="margin-left:auto" onclick="$('#gUp').click()">Upload</button></div>
  <div class="panel"><div id="gList"></div></div>`; listGlobal();
}
async function listGlobal() {
  filesCache = (await api('/files')).files;
  $('#gList').innerHTML = ['Projects', 'Downloads', 'Uploads', 'Knowledge'].map(f => `<div style="font-weight:700;margin:12px 0 4px">${f}</div>` + (filesCache.filter(x => x.folder === f).map(x => `<div class="fl"><span class="nm">${esc(x.name)}</span><span class="x" onclick="delFile('${x.id}')">✕</span></div>`).join('') || '<div class="hint">Empty</div>')).join('');
}
async function gUp() { const inp = $('#gUp'); if (!inp.files[0]) return; const fd = new FormData(); fd.append('file', inp.files[0]); fd.append('folder', 'Uploads'); await fetch('/api/files', { method: 'POST', body: fd, headers: { Authorization: 'Bearer ' + token } }); listGlobal(); }
function kbPage() {
  $('#main').innerHTML = `<div class="top"><h2>Knowledge Base</h2></div><div class="panel"><div class="hint">Each agent has its own Knowledge Base — open an agent to upload PDFs, DOCX, TXT and images it can search.</div></div>`;
}
async function marketPage() {
  const j = await api('/marketplace');
  $('#main').innerHTML = `<div class="top"><h2>Agent Marketplace</h2></div><div class="grid">${(j.agents.length ? j.agents : AG.map(a => ({ name: a.n, desc: 'Specialist', img: AV[a.i]+"?f=2", model: a.m }))).map(a => `<div class="agent-card"><img src="${a.img}?f=2"><div class="nm">${esc(a.name)}</div><div class="ds">${esc(a.desc || '')}</div><button class="btn primary" style="margin-top:10px;width:100%" onclick="installAgent('${a.id || ''}')">Install</button></div>`).join('')}</div>`;
}
async function installAgent(id) { if (!id) { alert('This agent ships with your account already.'); return; } await api(`/marketplace/${id}/install`, { method: 'POST' }); await loadAgents(); go('agents'); }
function workflowsPage() {
  $('#main').innerHTML = `<div class="top"><h2>Workflows</h2><button class="btn primary" style="margin-left:auto" onclick="newWorkflow()">+ New Workflow</button></div><div id="wfList"></div>`; listWF();
}
async function listWF() {
  const j = await api('/workflows');
  $('#wfList').innerHTML = j.workflows.map(w => `<div class="panel" style="margin-bottom:10px"><div class="row"><b>${esc(w.name)}</b><span class="badge">${w.steps.length} steps</span><span class="x" style="margin-left:auto" onclick="delWF('${w.id}')">✕</span></div></div>`).join('') || '<div class="panel hint">No workflows yet.</div>';
}
function newWorkflow() { const n = prompt('Workflow name:'); if (!n) return; api('/workflows', { method: 'POST', body: JSON.stringify({ name: n }) }).then(listWF); }
async function delWF(id) { await api('/workflows/' + id, { method: 'DELETE' }); listWF(); }
function settingsPage() {
  $('#main').innerHTML = `<div class="top"><h2>Settings</h2></div><div class="panel" style="max-width:460px"><div class="stat"><span>Email</span><span>${user.email}</span></div><div class="stat"><span>Status</span><span style="color:var(--ok)">Verified</span></div>
  <input id="pName" class="in" style="margin-top:14px" value="${esc(user.name)}" placeholder="Display name"><button class="btn primary" onclick="saveProfile()">Save Profile</button></div>`;
}
async function saveProfile() { const j = await api('/profile', { method: 'PUT', body: JSON.stringify({ name: $('#pName').value }) }); user = j.user; alert('Saved'); }
function apiPage() {
  return `<div class="top"><h2>API</h2></div><div class="panel"><div class="stat"><span>Chat endpoint</span><span>POST /api/agents/:id/chat</span></div><div class="stat"><span>Agents</span><span>GET /api/agents</span></div><div class="stat"><span>Files</span><span>POST /api/files</span></div><div class="stat"><span>Knowledge</span><span>POST /api/agents/:id/kb</span></div><div class="hint">Authenticate with your Bearer token from sign in.</div></div>`;
}

/* boot */
buildOrbit(); buildMarket();
if (token) { api('/me').then(j => enterApp(j.user)).catch(() => logout()); }
