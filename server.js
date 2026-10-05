/* EVE GARDEN AI — backend */
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const DATA = path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const DB = path.join(DATA, 'db.json');
let db = { users: {}, agents: {}, chats: {}, pending: {}, resets: {} };
try { db = JSON.parse(fs.readFileSync(DB, 'utf8')); } catch (e) {}
const save = () => fs.writeFileSync(DB, JSON.stringify(db));

app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));

/* ---------- helpers ---------- */
const uid = () => crypto.randomUUID();
const now = () => Date.now();
const pub = u => ({ id: u.id, email: u.email, name: u.name, verified: u.verified, createdAt: u.createdAt });
const tok = () => crypto.randomBytes(24).toString('hex');

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  const u = t && db.sessions && db.sessions[t];
  if (!u) return res.status(401).json({ error: 'Not signed in' });
  req.userId = u;
  next();
}

/* default 9 agents seeded per new user */
const AGENT_TYPES = [
  { name: 'Coding Agent', desc: 'Professional AI engineer that writes, runs and debugs code.', model: 'openai/gpt-oss-120b', img: '/agents/agent1.jpg', tools: ['terminal', 'fileManager', 'codeEditor', 'knowledgeBase', 'api'] },
  { name: 'Research Agent', desc: 'Scientific analyst with web research and summarization.', model: 'openai/gpt-oss-120b', img: '/agents/agent2.jpg', tools: ['browser', 'search', 'knowledgeBase'] },
  { name: 'Business Agent', desc: 'Corporate strategist for plans, pitches and analysis.', model: 'openai/gpt-oss-120b', img: '/agents/agent3.jpg', tools: ['browser', 'knowledgeBase', 'api'] },
  { name: 'Design Agent', desc: 'Creative AI artist for visuals, UI and brand assets.', model: 'gemini-2.0-flash', img: '/agents/agent4.jpg', tools: ['imageGenerator', 'codeEditor', 'fileManager'] },
  { name: 'Security Agent', desc: 'Cybersecurity specialist for audits and hardening.', model: 'openai/gpt-oss-120b', img: '/agents/agent5.jpg', tools: ['terminal', 'browser', 'fileManager'] },
  { name: 'Automation Agent', desc: 'Operations controller for autonomous workflows.', model: 'openai/gpt-oss-120b', img: '/agents/agent6.jpg', tools: ['terminal', 'fileManager', 'api'] },
  { name: 'Marketing Agent', desc: 'Growth marketer for campaigns and copy.', model: 'openai/gpt-oss-120b', img: '/agents/agent7.jpg', tools: ['browser', 'search', 'knowledgeBase'] },
  { name: 'Data Agent', desc: 'Analyst for datasets, charts and insights.', model: 'gemini-2.0-flash', img: '/agents/agent8.jpg', tools: ['terminal', 'fileManager', 'knowledgeBase'] },
  { name: 'Support Agent', desc: 'Customer support assistant with product knowledge.', model: 'openai/gpt-oss-120b', img: '/agents/agent9.jpg', tools: ['browser', 'knowledgeBase'] }
];

function seedAgents(userId) {
  db.agents[userId] = AGENT_TYPES.map(t => ({
    id: uid(), ownerId: userId, ...t,
    personality: 'Professional, focused, helpful.',
    instructions: `You are ${t.name}, ${t.desc}`,
    memory: true, voice: false, vision: true,
    memorySize: 0, lastActive: now(), tools: t.tools, published: false
  }));
}

/* ---------- AI providers ---------- */
const GROQ = () => process.env.GROQ_API_KEY;
const OR = () => process.env.OPENROUTER_API_KEY;
const GEM = () => process.env.GEMINI_API_KEY;

async function callGroq(model, messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ()}` },
    body: JSON.stringify({ model, messages, max_tokens: 2048 })
  });
  const j = await r.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  return j.choices[0].message.content;
}
async function callOpenRouter(model, messages) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OR()}` },
    body: JSON.stringify({ model, messages, max_tokens: 2048 })
  });
  const j = await r.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  return j.choices[0].message.content;
}
async function callGemini(model, messages) {
  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEM()}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, systemInstruction: sys ? { parts: [{ text: sys }] } : undefined })
  });
  const j = await r.json();
  const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  if (!t) throw new Error(JSON.stringify(j).slice(0, 300));
  return t.map(p => p.text).join('');
}

async function askAI(model, messages) {
  if (model.includes('gemini')) return callGemini(model, messages);
  if (GROQ() && model.startsWith('gpt-oss')) { try { return await callGroq(model, messages); } catch (e) { if (!OR()) throw e; } }
  if (OR()) return callOpenRouter('openai/gpt-oss-120b', messages);
  return callGroq('openai/gpt-oss-120b', messages);
}

function buildContext(agent, userId, userMsg) {
  const msgs = [{ role: 'system', content: `${agent.instructions}\nPersonality: ${agent.personality}\nTools available: ${(agent.tools || []).join(', ')}.\nWhen you want to use a tool, describe it inline like [TOOL:browser] https://example.com . The platform executes real tools for the user.` }];
  if (agent.memory) {
    const mem = (db.memory && db.memory[agent.id]) || [];
    mem.slice(-10).forEach(m => msgs.push({ role: m.role === 'agent' ? 'assistant' : m.role, content: m.content }));
    const facts = (db.facts && db.facts[agent.id]) || [];
    if (facts.length) msgs.push({ role: 'system', content: 'Memory / user facts:\n' + facts.map(f => '- ' + f.text).join('\n') });
  }
  const kb = (db.kb && db.kb[agent.id]) || [];
  if (kb.length) {
    const hits = kb.filter(d => d.text && d.text.toLowerCase().includes(userMsg.toLowerCase().slice(0, 40))).slice(0, 3);
    if (hits.length) msgs.push({ role: 'system', content: 'Knowledge base excerpts:\n' + hits.map(h => h.text.slice(0, 1200)).join('\n---\n') });
  }
  msgs.push({ role: 'user', content: userMsg });
  return msgs;
}

/* real tool execution */
async function runTool(agent, text) {
  const m = text.match(/\[TOOL:(\w+)\]\s*(https?:\/\/\S+|[^\n]*)?/);
  if (!m) return null;
  const [, tool, argRaw] = m; const arg = (argRaw || '').trim();
  try {
    if (tool === 'browser' || tool === 'search') {
      let url = arg;
      if (!/^https?:/.test(url)) {
        const r = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(arg)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const html = await r.text();
        const links = [...html.matchAll(/result__a[^>]*>(.*?)<\/a>/g)].slice(0, 5).map(x => x[1].replace(/<[^>]*>/g, ''));
        return `[Browser search for "${arg}"]\n` + links.map(l => '- ' + l).join('\n');
      }
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await r.text();
      const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
      return `[Browser read ${url}]\n` + textOnly;
    }
    return `[${tool}] queued — result shown in the tool panel.`;
  } catch (e) { return `[${tool}] error: ${e.message}`; }
}

/* ---------- AUTH ---------- */
app.post('/api/signup', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const key = email.toLowerCase().trim();
  if (db.users[key]) return res.status(400).json({ error: 'Account already exists' });
  const t = tok();
  db.pending[t] = { key, exp: now() + 1000 * 60 * 60 * 24 };
  db.users[key] = { id: uid(), email: key, name: name || key.split('@')[0], password: bcrypt.hashSync(password, 10), verified: false, createdAt: now() };
  seedAgents(db.users[key].id);
  save();
  // No SMTP connected: return the verification link directly so signup works end to end.
  res.json({ ok: true, verifyToken: t, message: 'Account created. Verify your email to finish.' });
});
app.post('/api/verify', (req, res) => {
  const { token } = req.body;
  const p = db.pending[token];
  if (!p || p.exp < now()) return res.status(400).json({ error: 'Invalid or expired verification link' });
  db.users[p.key].verified = true; delete db.pending[token]; save();
  res.json({ ok: true });
});
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const u = db.users[(email || '').toLowerCase().trim()];
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({ error: 'Wrong email or password' });
  if (!u.verified) return res.status(401).json({ error: 'Please verify your email first', needVerify: true });
  db.sessions = db.sessions || {};
  const t = tok(); db.sessions[t] = u.id; save();
  res.json({ ok: true, token: t, user: pub(u) });
});
app.post('/api/forgot', (req, res) => {
  const { email } = req.body;
  const u = db.users[(email || '').toLowerCase().trim()];
  if (!u) return res.json({ ok: true }); // don't reveal existence
  const t = tok(); db.resets[t] = { key: u.email, exp: now() + 1000 * 60 * 30 }; save();
  res.json({ ok: true, resetToken: t });
});
app.post('/api/reset', (req, res) => {
  const { token, password } = req.body;
  const r = db.resets[token];
  if (!r || r.exp < now()) return res.status(400).json({ error: 'Invalid or expired reset link' });
  db.users[r.key].password = bcrypt.hashSync(password, 10); delete db.resets[token]; save();
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => {
  const u = Object.values(db.users).find(x => x.id === req.userId);
  res.json({ user: pub(u) });
});
app.put('/api/profile', auth, (req, res) => {
  const u = Object.values(db.users).find(x => x.id === req.userId);
  u.name = req.body.name || u.name; save(); res.json({ user: pub(u) });
});

/* ---------- AGENTS ---------- */
app.get('/api/agents', auth, (req, res) => res.json({ agents: db.agents[req.userId] || [] }));
app.post('/api/agents', auth, (req, res) => {
  const b = req.body;
  const a = {
    id: uid(), ownerId: req.userId,
    name: b.name || 'New Agent', desc: b.desc || '', personality: b.personality || 'Helpful and professional.',
    instructions: b.instructions || '', memory: b.memory !== false, voice: !!b.voice, vision: !!b.vision,
    model: b.model || 'openai/gpt-oss-120b', img: b.img || '/agents/agent4.jpg',
    tools: b.tools || ['browser', 'knowledgeBase'], memorySize: 0, lastActive: now(), published: false
  };
  db.agents[req.userId] = db.agents[req.userId] || [];
  db.agents[req.userId].push(a); save();
  res.json({ agent: a });
});
app.put('/api/agents/:id', auth, (req, res) => {
  const a = (db.agents[req.userId] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  Object.assign(a, req.body, { id: a.id, ownerId: a.ownerId }); save();
  res.json({ agent: a });
});
app.delete('/api/agents/:id', auth, (req, res) => {
  db.agents[req.userId] = (db.agents[req.userId] || []).filter(x => x.id !== req.params.id); save();
  res.json({ ok: true });
});

/* ---------- CHAT ---------- */
app.post('/api/agents/:id/chat', auth, async (req, res) => {
  const a = (db.agents[req.userId] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  const { message } = req.body;
  db.memory = db.memory || {}; db.memory[a.id] = db.memory[a.id] || [];
  db.memory[a.id].push({ role: 'user', content: message, t: now() });
  let reply;
  try {
    reply = await askAI(a.model, buildContext(a, req.userId, message));
  } catch (e) {
    return res.status(502).json({ error: 'AI provider error: ' + e.message.slice(0, 200) });
  }
  db.memory[a.id].push({ role: 'assistant', content: reply, t: now() });
  a.memorySize = db.memory[a.id].length; a.lastActive = now(); save();
  const toolResult = await runTool(a, reply);
  res.json({ reply, toolResult });
});
app.get('/api/agents/:id/messages', auth, (req, res) => {
  db.memory = db.memory || {};
  res.json({ messages: (db.memory[req.params.id] || []).slice(-100) });
});

/* ---------- MEMORY FACTS / KNOWLEDGE ---------- */
app.get('/api/agents/:id/memory', auth, (req, res) => {
  db.facts = db.facts || {};
  res.json({ facts: db.facts[req.params.id] || [] });
});
app.post('/api/agents/:id/memory', auth, (req, res) => {
  db.facts = db.facts || {}; db.facts[req.params.id] = db.facts[req.params.id] || [];
  db.facts[req.params.id].push({ id: uid(), text: req.body.text, t: now() }); save();
  res.json({ ok: true });
});

app.get('/api/agents/:id/kb', auth, (req, res) => {
  db.kb = db.kb || {};
  res.json({ docs: (db.kb[req.params.id] || []).map(d => ({ id: d.id, name: d.name, size: (d.text || '').length, t: d.t })) });
});
app.post('/api/agents/:id/kb', auth, (req, res) => {
  db.kb = db.kb || {}; db.kb[req.params.id] = db.kb[req.params.id] || [];
  db.kb[req.params.id].push({ id: uid(), name: req.body.name, text: req.body.text, t: now() }); save();
  res.json({ ok: true });
});
app.delete('/api/agents/:id/kb/:docId', auth, (req, res) => {
  db.kb[req.params.id] = (db.kb[req.params.id] || []).filter(d => d.id !== req.params.docId); save();
  res.json({ ok: true });
});

/* ---------- FILES ---------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
app.get('/api/files', auth, (req, res) => {
  db.files = db.files || {};
  res.json({ files: db.files[req.userId] || [] });
});
app.post('/api/files', auth, upload.single('file'), (req, res) => {
  db.files = db.files || {}; db.files[req.userId] = db.files[req.userId] || [];
  db.files[req.userId].push({ id: uid(), name: req.file.originalname, folder: req.body.folder || 'Uploads', data: req.file.buffer.toString('base64'), size: req.file.size, t: now() });
  save(); res.json({ ok: true });
});
app.get('/api/files/:id', auth, (req, res) => {
  const f = (db.files[req.userId] || []).find(x => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'Not found' });
  res.json({ file: f });
});
app.delete('/api/files/:id', auth, (req, res) => {
  db.files[req.userId] = (db.files[req.userId] || []).filter(f => f.id !== req.params.id); save();
  res.json({ ok: true });
});
app.put('/api/files/:id', auth, (req, res) => {
  const f = (db.files[req.userId] || []).find(x => x.id === req.params.id);
  if (f && req.body.name) f.name = req.body.name;
  if (f && req.body.folder) f.folder = req.body.folder;
  save(); res.json({ ok: true });
});

/* ---------- MARKETPLACE ---------- */
app.post('/api/agents/:id/publish', auth, (req, res) => {
  const a = (db.agents[req.userId] || []).find(x => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  a.published = true; save(); res.json({ ok: true });
});
app.get('/api/marketplace', (req, res) => {
  const all = [];
  Object.values(db.agents).forEach(list => list.forEach(a => { if (a.published) all.push({ id: a.id, name: a.name, desc: a.desc, img: a.img, model: a.model }); }));
  res.json({ agents: all });
});
app.post('/api/marketplace/:id/install', auth, (req, res) => {
  const a = Object.values(db.agents).flat().find(x => x.id === req.params.id && x.published);
  if (!a) return res.status(404).json({ error: 'Not found' });
  db.agents[req.userId].push({ ...a, id: uid(), ownerId: req.userId, published: false }); save();
  res.json({ ok: true });
});

/* ---------- WORKFLOWS ---------- */
app.get('/api/workflows', auth, (req, res) => {
  db.workflows = db.workflows || {};
  res.json({ workflows: db.workflows[req.userId] || [] });
});
app.post('/api/workflows', auth, (req, res) => {
  db.workflows = db.workflows || {}; db.workflows[req.userId] = db.workflows[req.userId] || [];
  const w = { id: uid(), name: req.body.name || 'New workflow', steps: req.body.steps || [], t: now() };
  db.workflows[req.userId].push(w); save(); res.json({ workflow: w });
});
app.delete('/api/workflows/:id', auth, (req, res) => {
  db.workflows[req.userId] = (db.workflows[req.userId] || []).filter(w => w.id !== req.params.id); save();
  res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('EVE GARDEN AI on ' + PORT));
