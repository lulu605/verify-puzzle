const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'config', 'nodes.json');
const adminTokens = new Map();

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

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.mp3', '.wav', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch { return { nodes: [] }; }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.post('/api/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '图片上传失败' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get('/api/nodes', (req, res) => {
  const data = readData();
  res.json(data.nodes);
});

app.get('/api/nodes/:id', (req, res) => {
  const data = readData();
  const node = data.nodes.find(n => n.node_id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  res.json(node);
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const data = readData();
  if (password === getPwd(data)) {
    const token = sha256(Date.now() + password + Math.random());
    adminTokens.set(token, { loginAt: Date.now() });
    res.json({ token });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

app.put('/api/admin/password', auth, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) return res.status(400).json({ error: '需要旧密码和新密码' });
  if (new_password.length < 4) return res.status(400).json({ error: '新密码至少4个字符' });
  const data = readData();
  if (old_password !== getPwd(data)) return res.status(401).json({ error: '旧密码错误' });
  data.gameConfig = { ...(data.gameConfig || {}), admin_password: new_password };
  writeData(data);
  adminTokens.clear();
  res.json({ success: true });
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
  const data = readData();
  res.json(data.gameConfig || DEFAULT_GAME_CONFIG);
});

app.put('/api/game-config', auth, (req, res) => {
  const data = readData();
  data.gameConfig = { ...DEFAULT_GAME_CONFIG, ...(data.gameConfig || {}), ...req.body };
  writeData(data);
  res.json(data.gameConfig);
});

app.get('/api/chapters', (req, res) => {
  const data = readData();
  const chapters = {};
  data.nodes.forEach(n => {
    const ch = n.chapter || '默认章节';
    if (!chapters[ch]) chapters[ch] = [];
    chapters[ch].push(n.node_id);
  });
  const list = Object.entries(chapters).map(([name, nodeIds]) => ({ name, node_ids: nodeIds }));
  res.json(list);
});

app.put('/api/chapters/rename', auth, (req, res) => {
  const { old_name, new_name } = req.body;
  if (!old_name || !new_name) return res.status(400).json({ error: '需要 old_name 和 new_name' });
  const data = readData();
  data.nodes.forEach(n => {
    if ((n.chapter || '默认章节') === old_name) n.chapter = new_name;
  });
  writeData(data);
  res.json({ success: true });
});

app.post('/api/nodes', auth, (req, res) => {
  const data = readData();
  const { node_name, background, chapter } = req.body;
  const node = {
    node_id: uuidv4().slice(0, 8),
    chapter: chapter || '默认章节',
    node_name: node_name || '未命名节点',
    background: background || { type: 'color', value: '#0a0e27' },
    display_mode: 'dialogue',
    text_content: '',
    text_music: null,
    show_credits_after: false,
    dialogues: [],
    puzzle: {
      question_text: '',
      question_image: null,
      correct_answer: '',
      answer_match_rule: 'exact',
      max_attempts: 3,
      error_hint: '答案不对，再想想！'
    },
    next_node_id: null
  };
  data.nodes.push(node);
  writeData(data);
  res.json(node);
});

app.put('/api/nodes/:id', auth, (req, res) => {
  const data = readData();
  const idx = data.nodes.findIndex(n => n.node_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '节点不存在' });
  data.nodes[idx] = { ...data.nodes[idx], ...req.body, node_id: req.params.id };
  writeData(data);
  res.json(data.nodes[idx]);
});

app.delete('/api/nodes/:id', auth, (req, res) => {
  const data = readData();
  const idx = data.nodes.findIndex(n => n.node_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '节点不存在' });
  const [deleted] = data.nodes.splice(idx, 1);
  writeData(data);
  res.json(deleted);
});

app.put('/api/nodes/:id/dialogues', auth, (req, res) => {
  const data = readData();
  const node = data.nodes.find(n => n.node_id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.dialogues = req.body.dialogues || [];
  writeData(data);
  res.json(node);
});

app.put('/api/nodes/:id/puzzle', auth, (req, res) => {
  const data = readData();
  const node = data.nodes.find(n => n.node_id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.puzzle = { ...node.puzzle, ...req.body };
  writeData(data);
  res.json(node);
});

app.post('/api/verify', (req, res) => {
  const { node_id, answer } = req.body;
  const data = readData();
  const node = data.nodes.find(n => n.node_id === node_id);
  if (!node) return res.status(404).json({ error: '节点不存在' });

  const puzzle = node.puzzle;
  const userAnswer = String(answer || '').trim();
  let correct = false;

  switch (puzzle.answer_match_rule) {
    case 'exact':
      correct = userAnswer === String(puzzle.correct_answer).trim();
      break;
    case 'case_insensitive':
      correct = userAnswer.toLowerCase() === String(puzzle.correct_answer).trim().toLowerCase();
      break;
    case 'fuzzy':
      correct = userAnswer.includes(String(puzzle.correct_answer).trim()) ||
                String(puzzle.correct_answer).trim().includes(userAnswer);
      break;
    default:
      correct = userAnswer === String(puzzle.correct_answer).trim();
  }

  if (correct) {
    const nextNode = node.next_node_id
      ? data.nodes.find(n => n.node_id === node.next_node_id)
      : null;
    res.json({ correct: true, message: '回答正确！', next_node_id: node.next_node_id, next_node: nextNode || null });
  } else {
    res.json({ correct: false, message: puzzle.error_hint || '答案不对，再想想！' });
  }
});

const COMMENTS_FILE = path.join(__dirname, 'config', 'comments.json');

function readComments() {
  try { return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8')); } catch { return []; }
}

function writeComments(comments) {
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2), 'utf8');
}

app.post('/api/comments', (req, res) => {
  const { name, age, rating, content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '请输入留言内容' });
  const comments = readComments();
  comments.push({
    id: uuidv4().slice(0, 8),
    name: (name || '匿名').trim(),
    child_age: (age || '').trim(),
    rating: rating || null,
    content: content.trim(),
    time: new Date().toISOString()
  });
  writeComments(comments);
  res.json({ success: true });
});

app.get('/api/comments', auth, (req, res) => {
  res.json(readComments());
});

app.delete('/api/comments/:id', auth, (req, res) => {
  let comments = readComments();
  comments = comments.filter(c => c.id !== req.params.id);
  writeComments(comments);
  res.json({ success: true });
});

const CODES_FILE = path.join(__dirname, 'config', 'codes.json');

function readCodes() {
  try { return JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')); } catch { return []; }
}

function writeCodes(codes) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2), 'utf8');
}

function generateCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

app.post('/api/admin/codes', auth, (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body.count) || 1, 1), 50);
  const codes = readCodes();
  const newCodes = [];
  for (let i = 0; i < count; i++) {
    const code = generateCode(8);
    codes.push({
      id: uuidv4().slice(0, 8),
      code,
      created_at: new Date().toISOString(),
      used: false,
      used_at: null
    });
    newCodes.push(code);
  }
  writeCodes(codes);
  res.json({ success: true, codes: newCodes });
});

app.get('/api/admin/codes', auth, (req, res) => {
  res.json(readCodes());
});

app.delete('/api/admin/codes/:id', auth, (req, res) => {
  let codes = readCodes();
  codes = codes.filter(c => c.id !== req.params.id);
  writeCodes(codes);
  res.json({ success: true });
});

app.post('/api/verify-code', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ valid: false, error: '请输入验证码' });
  const codes = readCodes();
  const entry = codes.find(c => c.code === code.trim().toUpperCase());
  if (!entry) return res.json({ valid: false, error: '验证码无效' });
  if (entry.used) return res.json({ valid: false, error: '此验证码已被使用' });
  res.json({
    valid: true,
    code: entry.code,
    saved_node: entry.saved_node || null,
    saved_inventory: entry.saved_inventory || null
  });
});

app.post('/api/save-progress', (req, res) => {
  const { code, node_id, inventory } = req.body;
  if (!code || !node_id) return res.status(400).json({ error: '参数错误' });
  const codes = readCodes();
  const entry = codes.find(c => c.code === code.trim().toUpperCase());
  if (!entry) return res.status(400).json({ error: '验证码不存在' });
  entry.saved_node = node_id;
  entry.saved_inventory = inventory || null;
  writeCodes(codes);
  res.json({ success: true });
});

app.post('/api/consume-code', (req, res) => {
  const { code } = req.body;
  if (!code || !code.trim()) return res.status(400).json({ error: '参数错误' });
  const codes = readCodes();
  const entry = codes.find(c => c.code === code.trim().toUpperCase());
  if (!entry) return res.status(400).json({ error: '验证码不存在' });
  if (entry.used) return res.json({ success: true });
  entry.used = true;
  entry.used_at = new Date().toISOString();
  entry.saved_node = null;
  entry.saved_inventory = null;
  writeCodes(codes);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`验证谜题小程序 服务已启动: http://localhost:${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin/`);
  console.log(`用户端: http://localhost:${PORT}/puzzle/`);
});
