const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'config', 'nodes.json');

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

app.post('/api/upload', upload.single('image'), (req, res) => {
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

const DEFAULT_GAME_CONFIG = {
  cover_title: '✦ 谜 境 探 索 ✦',
  cover_subtitle: '— 验证谜题 —',
  cover_button_text: '开始游戏',
  game_name: '验证谜题小程序',
  cover_background: 'linear-gradient(135deg,#0a0e27 0%,#1a1040 50%,#0a0e27 100%)',
  chapter_music: {}
};

app.get('/api/game-config', (req, res) => {
  const data = readData();
  res.json(data.gameConfig || DEFAULT_GAME_CONFIG);
});

app.put('/api/game-config', (req, res) => {
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

app.put('/api/chapters/rename', (req, res) => {
  const { old_name, new_name } = req.body;
  if (!old_name || !new_name) return res.status(400).json({ error: '需要 old_name 和 new_name' });
  const data = readData();
  data.nodes.forEach(n => {
    if ((n.chapter || '默认章节') === old_name) n.chapter = new_name;
  });
  writeData(data);
  res.json({ success: true });
});

app.post('/api/nodes', (req, res) => {
  const data = readData();
  const { node_name, background, chapter } = req.body;
  const node = {
    node_id: uuidv4().slice(0, 8),
    chapter: chapter || '默认章节',
    node_name: node_name || '未命名节点',
    background: background || { type: 'color', value: '#0a0e27' },
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

app.put('/api/nodes/:id', (req, res) => {
  const data = readData();
  const idx = data.nodes.findIndex(n => n.node_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '节点不存在' });
  data.nodes[idx] = { ...data.nodes[idx], ...req.body, node_id: req.params.id };
  writeData(data);
  res.json(data.nodes[idx]);
});

app.delete('/api/nodes/:id', (req, res) => {
  const data = readData();
  const idx = data.nodes.findIndex(n => n.node_id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '节点不存在' });
  const [deleted] = data.nodes.splice(idx, 1);
  writeData(data);
  res.json(deleted);
});

app.put('/api/nodes/:id/dialogues', (req, res) => {
  const data = readData();
  const node = data.nodes.find(n => n.node_id === req.params.id);
  if (!node) return res.status(404).json({ error: '节点不存在' });
  node.dialogues = req.body.dialogues || [];
  writeData(data);
  res.json(node);
});

app.put('/api/nodes/:id/puzzle', (req, res) => {
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

app.listen(PORT, () => {
  console.log(`验证谜题小程序 服务已启动: http://localhost:${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin/`);
  console.log(`用户端: http://localhost:${PORT}/puzzle/`);
});
