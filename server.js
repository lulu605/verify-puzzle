const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'config', 'nodes.json');
const STORIES_INDEX = path.join(__dirname, 'config', 'stories.json');
const STORIES_DIR = path.join(__dirname, 'config', 'stories');
const adminTokens = new Map();

function getStories() { try { return JSON.parse(fs.readFileSync(STORIES_INDEX, 'utf8')); } catch { return []; } }
function saveStories(s) { fs.writeFileSync(STORIES_INDEX, JSON.stringify(s, null, 2), 'utf8'); }
function storyDir(id) { return path.join(STORIES_DIR, id); }
function storyDataFile(id) { return path.join(storyDir(id), 'nodes.json'); }
function storyCommentsFile(id) { return path.join(storyDir(id), 'comments.json'); }
function storyCodesFile(id) { return path.join(storyDir(id), 'codes.json'); }
function readStoryData(id) { try { return JSON.parse(fs.readFileSync(storyDataFile(id), 'utf8')); } catch { return { nodes: [] }; } }
function writeStoryData(id, d) { fs.mkdirSync(storyDir(id), { recursive: true }); fs.writeFileSync(storyDataFile(id), JSON.stringify(d, null, 2), 'utf8'); }
function readStoryComments(id) { try { return JSON.parse(fs.readFileSync(storyCommentsFile(id), 'utf8')); } catch { return []; } }
function writeStoryComments(id, c) { fs.writeFileSync(storyCommentsFile(id), JSON.stringify(c, null, 2), 'utf8'); }
function readStoryCodes(id) { try { return JSON.parse(fs.readFileSync(storyCodesFile(id), 'utf8')); } catch { return []; } }
function writeStoryCodes(id, c) { fs.writeFileSync(storyCodesFile(id), JSON.stringify(c, null, 2), 'utf8'); }
function genId() { return uuidv4().slice(0, 8); }

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token || !adminTokens.has(token)) return res.status(401).json({ error: '未登录' });
  req.adminUser = adminTokens.get(token);
  next();
}

function getPwd(data) {
  return (data.gameConfig && data.gameConfig.admin_password) || 'admin123';
}
function getStoryPwd(sid) {
  const d = readStoryData(sid);
  return (d.gameConfig && d.gameConfig.admin_password) || 'admin123';
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function uploadDir(storyId) {
  const d = storyId ? path.join(__dirname, 'uploads', storyId) : path.join(__dirname, 'uploads');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function makeUpload(storyField) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir(req.query.story || req.body.story || '')),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.mp3', '.wav', '.ogg'];
      cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    }
  }).single(storyField || 'image');
}
const upload = makeUpload('image');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch { return { nodes: [] }; }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.post('/api/upload', auth, upload, (req, res) => {
  if (!req.file) return res.status(400).json({ error: '上传失败' });
  const prefix = req.query.story ? `/uploads/${req.query.story}/` : '/uploads/';
  res.json({ url: `${prefix}${req.file.filename}` });
});

function storyAware(fn) { return (req, res) => fn(req, res); }

app.get('/api/nodes', (req, res) => {
  if (req.query.story) { const d = readStoryData(req.query.story); return res.json(d.nodes); }
  const data = readData();
  res.json(data.nodes);
});

app.get('/api/nodes/:id', (req, res) => {
  if (req.query.story) { const d = readStoryData(req.query.story); const n = d.nodes.find(x => x.node_id === req.params.id); if (!n) return res.status(404).json({ error: '节点不存在' }); return res.json(n); }
  const data = readData();
  const node = data.nodes.find(n => n.node_id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  res.json(node);
});

// Story management
app.get('/api/stories', (req, res) => { res.json(getStories()); });

app.post('/api/stories', auth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '需要故事名称' });
  const id = genId();
  const stories = getStories();
  stories.push({ id, name: name.trim(), createdAt: new Date().toISOString() });
  saveStories(stories);
  writeStoryData(id, { nodes: [], gameConfig: { cover_title: name, cover_button_text: '开始游戏', chapter_music: {}, credits: { lines: ['感谢游玩', '制作人员'], music: null } } });
  writeStoryComments(id, []);
  writeStoryCodes(id, []);
  res.json({ id, name: name.trim() });
});

app.post('/api/stories/:id/copy', auth, (req, res) => {
  const { name } = req.body;
  const stories = getStories();
  const src = stories.find(s => s.id === req.params.id);
  if (!src) return res.status(404).json({ error: '源故事不存在' });
  const newId = genId();
  const newName = (name || src.name + ' (副本)').trim();
  stories.push({ id: newId, name: newName, createdAt: new Date().toISOString() });
  saveStories(stories);
  // Copy data files
  fs.mkdirSync(storyDir(newId), { recursive: true });
  try { fs.copyFileSync(storyDataFile(req.params.id), storyDataFile(newId)); } catch(e) { writeStoryData(newId, { nodes: [], gameConfig: {} }); }
  try { fs.copyFileSync(storyCommentsFile(req.params.id), storyCommentsFile(newId)); } catch(e) { writeStoryComments(newId, []); }
  try { fs.copyFileSync(storyCodesFile(req.params.id), storyCodesFile(newId)); } catch(e) { writeStoryCodes(newId, []); }
  // Copy upload files
  const srcDir = path.join(__dirname, 'uploads', req.params.id);
  const dstDir = path.join(__dirname, 'uploads', newId);
  if (fs.existsSync(srcDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
    fs.readdirSync(srcDir).forEach(f => {
      try { fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f)); } catch(e) {}
    });
  }
  // Update file URLs in the new story's data
  try {
    const newData = readStoryData(newId);
    const oldPrefix = `/uploads/${req.params.id}/`;
    const newPrefix = `/uploads/${newId}/`;
    const replaceUrls = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'string' && obj[k].includes(oldPrefix)) obj[k] = obj[k].split(oldPrefix).join(newPrefix);
        else if (typeof obj[k] === 'object') replaceUrls(obj[k]);
      }
    };
    newData.nodes.forEach(n => replaceUrls(n));
    if (newData.gameConfig) replaceUrls(newData.gameConfig);
    writeStoryData(newId, newData);
  } catch(e) { console.warn('URL replace warn:', e.message); }
  res.json({ id: newId, name: newName });
});

app.put('/api/stories/:id/rename', auth, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '需要名称' });
  const stories = getStories();
  const s = stories.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: '故事不存在' });
  s.name = name.trim();
  saveStories(stories);
  res.json({ success: true });
});

app.delete('/api/stories/:id', auth, (req, res) => {
  let stories = getStories();
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '故事不存在' });
  stories.splice(idx, 1);
  saveStories(stories);
  // Remove data files
  try { fs.rmSync(storyDir(req.params.id), { recursive: true, force: true }); } catch(e) {}
  // Remove upload files
  try { fs.rmSync(path.join(__dirname, 'uploads', req.params.id), { recursive: true, force: true }); } catch(e) {}
  res.json({ success: true });
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const data = readData();
  if (password === getPwd(data)) {
    const token = sha256(Date.now() + password + Math.random());
    adminTokens.set(token, { loginAt: Date.now() });
    return res.json({ token });
  }
  const stories = getStories();
  for (const s of stories) {
    if (password === getStoryPwd(s.id)) {
      const token = sha256(Date.now() + password + Math.random());
      adminTokens.set(token, { loginAt: Date.now() });
      return res.json({ token });
    }
  }
  res.status(401).json({ error: '密码错误' });
});

app.put('/api/admin/password', auth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: '需要旧密码和新密码' });
  if (new_password.length < 4) return res.status(400).json({ error: '新密码至少4个字符' });
  const data = readData();
  if (old_password === getPwd(data)) {
    data.gameConfig = { ...(data.gameConfig || {}), admin_password: new_password };
    writeData(data);
    adminTokens.clear();
    return res.json({ success: true });
  }
  // Check story passwords
  const stories = getStories();
  for (const s of stories) {
    if (old_password === getStoryPwd(s.id)) {
      const d = readStoryData(s.id);
      d.gameConfig = { ...(d.gameConfig || {}), admin_password: new_password };
      writeStoryData(s.id, d);
      adminTokens.clear();
      return res.json({ success: true });
    }
  }
  res.status(401).json({ error: '旧密码错误' });
});

app.post('/api/admin/check-token', auth, (req, res) => {
  res.json({ valid: true });
});

const DEFAULT_GAME_CONFIG = {
  cover_title: '✦ 谜 境 探 索 ✦',
  cover_subtitle: '— 验证谜题 —',
  cover_button_text: '开始游戏',
  game_name: '验证谜题小程序',
  cover_background: 'linear-gradient(135deg,#0a0e27 0%,#1a1040 50%,#0a0e27 100%)',
  chapter_music: {},
  cover_music: null,
  credits: { lines: ['感谢游玩', '制作人员'], music: null }
};

app.get('/api/game-config', (req, res) => {
  if (req.query.story) { const d = readStoryData(req.query.story); return res.json(d.gameConfig || DEFAULT_GAME_CONFIG); }
  const data = readData();
  res.json(data.gameConfig || DEFAULT_GAME_CONFIG);
});

app.put('/api/game-config', auth, (req, res) => {
  if (req.query.story) {
    const d = readStoryData(req.query.story);
    d.gameConfig = { ...DEFAULT_GAME_CONFIG, ...(d.gameConfig || {}), ...req.body };
    writeStoryData(req.query.story, d);
    return res.json(d.gameConfig);
  }
  const data = readData();
  data.gameConfig = { ...DEFAULT_GAME_CONFIG, ...(data.gameConfig || {}), ...req.body };
  writeData(data);
  res.json(data.gameConfig);
});

app.get('/api/chapters', (req, res) => {
  const src = req.query.story ? readStoryData(req.query.story) : readData();
  const chapters = {};
  src.nodes.forEach(n => {
    const ch = n.chapter || '默认章节';
    if (!chapters[ch]) chapters[ch] = [];
    chapters[ch].push(n.node_id);
  });
  res.json(Object.entries(chapters).map(([name, nodeIds]) => ({ name, node_ids: nodeIds })));
});

app.put('/api/chapters/rename', auth, (req, res) => {
  const { old_name, new_name } = req.body;
  if (!old_name || !new_name) return res.status(400).json({ error: '需要 old_name 和 new_name' });
  const sid = req.query.story;
  const src = sid ? readStoryData(sid) : readData();
  src.nodes.forEach(n => { if ((n.chapter || '默认章节') === old_name) n.chapter = new_name; });
  if (sid) writeStoryData(sid, src); else writeData(src);
  res.json({ success: true });
});

app.post('/api/nodes', auth, (req, res) => {
  const sid = req.query.story;
  const src = sid ? readStoryData(sid) : readData();
  const { node_name, background, chapter } = req.body;
  const node = {
    node_id: uuidv4().slice(0, 8),
    chapter: chapter || '默认章节',
    node_name: node_name || '未命名节点',
    background: background || { type: 'color', value: '#0a0e27' },
    display_mode: 'dialogue', text_content: '', text_music: null, show_credits_after: false,
    dialogues: [],
    puzzle: { question_text: '', question_image: null, correct_answer: '', answer_match_rule: 'exact', max_attempts: 3, error_hint: '答案不对，再想想！' },
    next_node_id: null
  };
  src.nodes.push(node);
  if (sid) writeStoryData(sid, src); else writeData(src);
  res.json(node);
});

function getNodeData(sid) { return sid ? readStoryData(sid) : readData(); }
function saveNodeData(sid, d) { if (sid) writeStoryData(sid, d); else writeData(d); }

app.put('/api/nodes/:id', auth, (req, res) => {
  const sid = req.query.story;
  const src = getNodeData(sid);
  const idx = src.nodes.findIndex(n => n.node_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '节点不存在' });
  src.nodes[idx] = { ...src.nodes[idx], ...req.body, node_id: req.params.id };
  saveNodeData(sid, src);
  res.json(src.nodes[idx]);
});

app.delete('/api/nodes/:id', auth, (req, res) => {
  const sid = req.query.story;
  const src = getNodeData(sid);
  const idx = src.nodes.findIndex(n => n.node_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '节点不存在' });
  const [deleted] = src.nodes.splice(idx, 1);
  saveNodeData(sid, src);
  res.json(deleted);
});

app.put('/api/nodes/:id/dialogues', auth, (req, res) => {
  const sid = req.query.story;
  const src = getNodeData(sid);
  const node = src.nodes.find(n => n.node_id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.dialogues = req.body.dialogues || [];
  saveNodeData(sid, src);
  res.json(node);
});

app.put('/api/nodes/:id/puzzle', auth, (req, res) => {
  const sid = req.query.story;
  const src = getNodeData(sid);
  const node = src.nodes.find(n => n.node_id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.puzzle = { ...node.puzzle, ...req.body };
  saveNodeData(sid, src);
  res.json(node);
});

app.post('/api/verify', (req, res) => {
  const { node_id, answer } = req.body;
  const sid = req.query.story;
  const src = getNodeData(sid);
  const node = src.nodes.find(n => n.node_id === node_id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  const puzzle = node.puzzle;
  const userAnswer = String(answer || '').trim();
  let correct = false;
  switch (puzzle.answer_match_rule) {
    case 'exact': correct = userAnswer === String(puzzle.correct_answer).trim(); break;
    case 'case_insensitive': correct = userAnswer.toLowerCase() === String(puzzle.correct_answer).trim().toLowerCase(); break;
    case 'fuzzy': correct = userAnswer.includes(String(puzzle.correct_answer).trim()) || String(puzzle.correct_answer).trim().includes(userAnswer); break;
    default: correct = userAnswer === String(puzzle.correct_answer).trim();
  }
  if (correct) {
    const nextNode = node.next_node_id ? src.nodes.find(n => n.node_id === node.next_node_id) : null;
    res.json({ correct: true, message: '回答正确！', next_node_id: node.next_node_id, next_node: nextNode || null });
  } else {
    res.json({ correct: false, message: puzzle.error_hint || '答案不对，再想想！' });
  }
});

// Story-aware comments & codes
app.post('/api/comments', (req, res) => {
  const sid = req.query.story;
  const { name, age, rating, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '请输入留言内容' });
  const comments = sid ? readStoryComments(sid) : (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'comments.json'), 'utf8')); } catch { return []; } })();
  comments.push({ id: uuidv4().slice(0, 8), name: (name || '匿名').trim(), child_age: (age || '').trim(), rating: rating || null, content: content.trim(), time: new Date().toISOString() });
  if (sid) writeStoryComments(sid, comments); else fs.writeFileSync(path.join(__dirname, 'config', 'comments.json'), JSON.stringify(comments, null, 2), 'utf8');
  res.json({ success: true });
});

app.get('/api/comments', auth, (req, res) => {
  const sid = req.query.story;
  if (sid) return res.json(readStoryComments(sid));
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'comments.json'), 'utf8'))); } catch { res.json([]); }
});

app.delete('/api/comments/:id', auth, (req, res) => {
  const sid = req.query.story;
  let comments = sid ? readStoryComments(sid) : (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'comments.json'), 'utf8')); } catch { return []; } })();
  comments = comments.filter(c => c.id !== req.params.id);
  if (sid) writeStoryComments(sid, comments); else fs.writeFileSync(path.join(__dirname, 'config', 'comments.json'), JSON.stringify(comments, null, 2), 'utf8');
  res.json({ success: true });
});

app.post('/api/admin/codes', auth, (req, res) => {
  const sid = req.query.story;
  const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 50);
  const codes = sid ? readStoryCodes(sid) : (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'codes.json'), 'utf8')); } catch { return []; } })();
  const newCodes = [];
  for (let i = 0; i < count; i++) {
    const code = (() => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let r = ''; for (let j = 0; j < 8; j++) r += c[Math.floor(Math.random() * c.length)]; return r; })();
    codes.push({ id: uuidv4().slice(0, 8), code, created_at: new Date().toISOString(), used: false, used_at: null });
    newCodes.push(code);
  }
  if (sid) writeStoryCodes(sid, codes); else fs.writeFileSync(path.join(__dirname, 'config', 'codes.json'), JSON.stringify(codes, null, 2), 'utf8');
  res.json({ success: true, codes: newCodes });
});

app.get('/api/admin/codes', auth, (req, res) => {
  const sid = req.query.story;
  if (sid) return res.json(readStoryCodes(sid));
  try { res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'codes.json'), 'utf8'))); } catch { res.json([]); }
});

app.delete('/api/admin/codes/:id', auth, (req, res) => {
  const sid = req.query.story;
  let codes = sid ? readStoryCodes(sid) : (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'codes.json'), 'utf8')); } catch { return []; } })();
  codes = codes.filter(c => c.id !== req.params.id);
  if (sid) writeStoryCodes(sid, codes); else fs.writeFileSync(path.join(__dirname, 'config', 'codes.json'), JSON.stringify(codes, null, 2), 'utf8');
  res.json({ success: true });
});

app.post('/api/verify-code', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ valid: false, error: '请输入验证码' });
  const sid = req.query.story;
  const codes = sid ? readStoryCodes(sid) : (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'codes.json'), 'utf8')); } catch { return []; } })();
  const entry = codes.find(c => c.code === code.trim().toUpperCase());
  if (!entry) return res.json({ valid: false, error: '验证码无效' });
  if (entry.used) return res.json({ valid: false, error: '此验证码已被使用' });
  res.json({ valid: true, code: entry.code, saved_node: entry.saved_node || null, saved_inventory: entry.saved_inventory || null, dialogue_index: entry.dialogue_index !== undefined ? entry.dialogue_index : -1, display_mode: entry.display_mode || 'dialogue' });
});

app.post('/api/save-progress', (req, res) => {
  const { code, node_id, inventory, dialogue_index, display_mode } = req.body;
  if (!code || !node_id) return res.status(400).json({ error: '参数错误' });
  const sid = req.query.story;
  const codes = sid ? readStoryCodes(sid) : (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'codes.json'), 'utf8')); } catch { return []; } })();
  const entry = codes.find(c => c.code === code.trim().toUpperCase());
  if (!entry) return res.status(400).json({ error: '验证码不存在' });
  entry.saved_node = node_id; entry.saved_inventory = inventory || null; entry.dialogue_index = dialogue_index !== undefined ? dialogue_index : 0; entry.display_mode = display_mode || 'dialogue';
  if (sid) writeStoryCodes(sid, codes); else fs.writeFileSync(path.join(__dirname, 'config', 'codes.json'), JSON.stringify(codes, null, 2), 'utf8');
  res.json({ success: true });
});

app.post('/api/consume-code', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: '参数错误' });
  const sid = req.query.story;
  const codes = sid ? readStoryCodes(sid) : (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config', 'codes.json'), 'utf8')); } catch { return []; } })();
  const entry = codes.find(c => c.code === code.trim().toUpperCase());
  if (!entry) return res.status(400).json({ error: '验证码不存在' });
  if (!entry.used) { entry.used = true; entry.used_at = new Date().toISOString(); entry.saved_node = null; entry.saved_inventory = null; entry.dialogue_index = -1; entry.display_mode = null; }
  if (sid) writeStoryCodes(sid, codes); else fs.writeFileSync(path.join(__dirname, 'config', 'codes.json'), JSON.stringify(codes, null, 2), 'utf8');
  res.json({ success: true });
});

// Serve story-specific puzzle pages at /:storyId/
app.get('/:maybeStory/', (req, res, next) => {
  const { maybeStory } = req.params;
  if (['puzzle', 'admin', 'uploads', 'api', 'js', 'css', 'favicon.ico'].includes(maybeStory)) return next();
  const stories = getStories();
  if (stories.some(s => s.id === maybeStory)) {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'puzzle', 'index.html'), 'utf8');
    return res.send(html.replace('</head>', `<script>window.__STORY_ID__="${maybeStory}";</script></head>`));
  }
  next();
});

// Startup migration: migrate existing config/nodes.json to a story if stories.json doesn't exist
const EXISTING_DATA = path.join(__dirname, 'config', 'nodes.json');
const EXISTING_COMMENTS = path.join(__dirname, 'config', 'comments.json');
const EXISTING_CODES = path.join(__dirname, 'config', 'codes.json');
if (!fs.existsSync(STORIES_INDEX) && fs.existsSync(EXISTING_DATA)) {
  try {
    const existingData = JSON.parse(fs.readFileSync(EXISTING_DATA, 'utf8'));
    const firstId = genId();
    saveStories([{ id: firstId, name: '西江奇谭', createdAt: new Date().toISOString() }]);
    fs.mkdirSync(storyDir(firstId), { recursive: true });
    writeStoryData(firstId, existingData);
    if (fs.existsSync(EXISTING_COMMENTS)) fs.copyFileSync(EXISTING_COMMENTS, storyCommentsFile(firstId));
    if (fs.existsSync(EXISTING_CODES)) fs.copyFileSync(EXISTING_CODES, storyCodesFile(firstId));
    // Migrate uploads
    const oldUploads = path.join(__dirname, 'uploads');
    if (fs.existsSync(oldUploads)) {
      const newUploads = path.join(__dirname, 'uploads', firstId);
      fs.mkdirSync(newUploads, { recursive: true });
      fs.readdirSync(oldUploads).forEach(f => {
        const fp = path.join(oldUploads, f);
        if (fs.statSync(fp).isFile()) try { fs.copyFileSync(fp, path.join(newUploads, f)); } catch(e) {}
      });
    }
    console.log('已迁移现有数据到故事:', firstId);
  } catch(e) { console.error('数据迁移失败:', e.message); }
}

app.listen(PORT, () => {
  const stories = getStories();
  console.log(`验证谜题小程序 服务已启动: http://localhost:${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin/`);
  console.log(`用户端: http://localhost:${PORT}/puzzle/`);
  stories.forEach(s => console.log(`故事 [${s.name}]: http://localhost:${PORT}/${s.id}/`));
});
