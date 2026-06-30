let currentId = null;
let saveTimer = null;
let previewIdx = 0;
let adminToken = localStorage.getItem('admin_token');
let currentStoryId = localStorage.getItem('admin_story_id') || '';
let stories = [];

async function api(path, opts = {}) {
  if (currentStoryId && !path.includes('story=') && !path.includes('/admin/login') && !path.includes('/admin/check-token') && !path.includes('/api/stories')) {
    const sep = path.includes('?') ? '&' : '?';
    path = path + sep + 'story=' + currentStoryId;
  }
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (adminToken) headers['Authorization'] = adminToken;
  const res = await fetch(path, { headers, ...opts });
  if (res.status === 401) {
    localStorage.removeItem('admin_token');
    adminToken = null;
    document.getElementById('loginOverlay').style.display = 'flex';
    throw new Error('未登录');
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadStories() {
  stories = await api('/api/stories');
  const badge = document.getElementById('storyBadge');
  if (badge) badge.textContent = (stories.find(s => s.id === currentStoryId)?.name || '未选择') + ' ›';
  if (!currentStoryId || !stories.find(s => s.id === currentStoryId)) {
    currentStoryId = stories[0]?.id || '';
    localStorage.setItem('admin_story_id', currentStoryId);
  }
  if (currentStoryId) loadChapters();
}

async function switchStory(id) {
  currentStoryId = id;
  localStorage.setItem('admin_story_id', id);
  const badge = document.getElementById('storyBadge');
  if (badge) badge.textContent = (stories.find(s => s.id === id)?.name || '') + ' ›';
  document.getElementById('editorContent').style.display = 'none';
  document.getElementById('editorPlaceholder').style.display = 'block';
  document.getElementById('gameConfigEditor').style.display = 'none';
  document.getElementById('codesView').style.display = 'none';
  document.getElementById('commentsView').style.display = 'none';
  document.getElementById('storyManageView').style.display = 'none';
  currentId = null;
  await loadChapters();
}

function showStoryManager() {
  document.getElementById('editorContent').style.display = 'none';
  document.getElementById('editorPlaceholder').style.display = 'none';
  document.getElementById('gameConfigEditor').style.display = 'none';
  document.getElementById('codesView').style.display = 'none';
  document.getElementById('commentsView').style.display = 'none';
  document.getElementById('storyManageView').style.display = 'block';
  renderStoryManage();
}

function renderStoryManage() {
  const list = document.getElementById('storyManageList');
  list.innerHTML = stories.map(s => {
    const isActive = s.id === currentStoryId;
    const storyUrl = window.location.origin + '/' + s.id + '/';
    return `<div class="story-card${isActive?' active':''}" onclick="selectStoryFromManage('${s.id}')">
      <div style="flex:1;min-width:0">
        <div class="sc-name">${escHtml(s.name)}${isActive?' <span class="sc-badge">当前</span>':''}</div>
        <div class="sc-url">${storyUrl}</div>
        <div class="sc-date">创建: ${new Date(s.createdAt).toLocaleDateString('zh-CN')}</div>
      </div>
      <div class="sc-actions">
        <button class="btn btn-xs btn-secondary" onclick="event.stopPropagation();copyStoryById('${s.id}')" title="复制">📋</button>
        <button class="btn btn-xs btn-secondary" onclick="event.stopPropagation();renameStoryById('${s.id}')" title="重命名">✎</button>
        ${stories.length > 1 ? `<button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteStoryById('${s.id}')" title="删除">🗑</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function selectStoryFromManage(id) {
  if (id === currentStoryId) return;
  await switchStory(id);
  renderStoryManage();
}

async function createStory() {
  const name = prompt('输入新故事名称：');
  if (!name || !name.trim()) return;
  await api('/api/stories', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
  await loadStories();
  if (stories.length > 0) { currentStoryId = stories[stories.length - 1].id; localStorage.setItem('admin_story_id', currentStoryId); await switchStory(currentStoryId); }
  renderStoryManage();
}

async function copyStoryById(id) {
  const name = prompt('输入副本名称：');
  await api('/api/stories/' + id + '/copy', { method: 'POST', body: JSON.stringify({ name: name || '' }) });
  await loadStories();
  if (stories.length > 0) { currentStoryId = stories[stories.length - 1].id; localStorage.setItem('admin_story_id', currentStoryId); await switchStory(currentStoryId); }
  renderStoryManage();
}

async function renameStoryById(id) {
  const s = stories.find(x => x.id === id);
  if (!s) return;
  const name = prompt('输入新名称：', s.name);
  if (!name || !name.trim() || name.trim() === s.name) return;
  await api('/api/stories/' + id + '/rename', { method: 'PUT', body: JSON.stringify({ name: name.trim() }) });
  await loadStories();
  renderStoryManage();
}

async function deleteStoryById(id) {
  const s = stories.find(x => x.id === id);
  if (!s) return;
  if (!confirm('确定要删除故事「' + s.name + '」？所有节点数据、留言、上传文件将被永久删除！')) return;
  await api('/api/stories/' + id, { method: 'DELETE' });
  await loadStories();
  if (currentStoryId === id) {
    currentStoryId = stories[0]?.id || '';
    localStorage.setItem('admin_story_id', currentStoryId);
    if (currentStoryId) await switchStory(currentStoryId);
  }
  renderStoryManage();
}

async function loadChapters() {
  const chapters = await api('/api/chapters');
  const allNodes = await api('/api/nodes');
  const list = document.getElementById('chapterList');
  list.innerHTML = chapters.map(ch => `
    <div class="chapter-group">
      <div class="chapter-header" onclick="toggleChapter(this)">
        <span class="chapter-toggle">▶</span>
        <span class="chapter-name">${escHtml(ch.name)}</span>
        <span class="chapter-count">${ch.node_ids.length}</span>
        <span class="chapter-actions">
          <button class="btn btn-xs btn-secondary" onclick="event.stopPropagation();renameChapter('${escHtml(ch.name)}')">✎</button>
          <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteChapter('${escHtml(ch.name)}')">×</button>
        </span>
      </div>
      <div class="chapter-nodes">
        ${ch.node_ids.map(nid => {
          const n = allNodes.find(x => x.node_id === nid);
          if (!n) return '';
          const bg = typeof n.background === 'object' ? (n.background?.value || '#0a0e27') : (n.background || '#0a0e27');
          return `<div class="node-item${n.node_id === currentId ? ' active' : ''}" onclick="selectNode('${n.node_id}')">
            <span class="node-tag" style="background:${bg}"></span>
            <span class="node-name">${escHtml(n.node_name)}</span>
          </div>`;
        }).join('')}
        <button class="btn btn-sm btn-primary add-node-btn" onclick="event.stopPropagation();createNodeInChapter('${escHtml(ch.name)}')">+ 节点</button>
      </div>
    </div>
  `).join('');
  return allNodes;
}

function toggleChapter(el) {
  el.classList.toggle('collapsed');
  const toggle = el.querySelector('.chapter-toggle');
  toggle.textContent = el.classList.contains('collapsed') ? '▶' : '▼';
  const nodes = el.nextElementSibling;
  nodes.style.display = el.classList.contains('collapsed') ? 'none' : '';
}

async function addChapter() {
  const name = prompt('请输入章节名称：');
  if (!name || !name.trim()) return;
  const subtitle = prompt('请输入章节副标题（可选）：');
  const node = await api('/api/nodes', {
    method: 'POST',
    body: JSON.stringify({ node_name: '新节点', chapter: name.trim() })
  });
  if (subtitle && subtitle.trim()) {
    const cfg = await api('/api/game-config');
    const subtitles = cfg.chapter_subtitles || {};
    subtitles[name.trim()] = subtitle.trim();
    await api('/api/game-config', {
      method: 'PUT',
      body: JSON.stringify({ chapter_subtitles: subtitles })
    });
  }
  loadChapters();
}

async function renameChapter(oldName) {
  const name = prompt('请输入新的章节名称：', oldName);
  if (!name || !name.trim() || name.trim() === oldName) return;
  await api('/api/chapters/rename', {
    method: 'PUT',
    body: JSON.stringify({ old_name: oldName, new_name: name.trim() })
  });
  const cfg = await api('/api/game-config');
  const subtitles = cfg.chapter_subtitles || {};
  const oldSub = subtitles[oldName];
  if (oldSub !== undefined) {
    delete subtitles[oldName];
    subtitles[name.trim()] = oldSub;
    await api('/api/game-config', {
      method: 'PUT',
      body: JSON.stringify({ chapter_subtitles: subtitles })
    });
  }
  if (currentId) selectNode(currentId);
  loadChapters();
}

async function deleteChapter(chapterName) {
  const nodes = await api('/api/nodes');
  const chNodes = nodes.filter(n => (n.chapter || '默认章节') === chapterName);
  if (chNodes.length > 0 && !confirm(`章节「${chapterName}」下有 ${chNodes.length} 个节点，确定删除此章节？（节点不会删除，将移至「默认章节」）`)) return;
  if (chNodes.length === 0 && !confirm(`确定删除空章节「${chapterName}」？`)) return;
  await api('/api/chapters/rename', {
    method: 'PUT',
    body: JSON.stringify({ old_name: chapterName, new_name: '默认章节' })
  });
  if (currentId) selectNode(currentId);
  loadChapters();
}

function populateChapterSelect(selected) {
  const sel = document.getElementById('editChapter');
  const chapters = document.querySelectorAll('.chapter-header .chapter-name');
  const names = Array.from(chapters).map(el => el.textContent);
  const unique = [...new Set(names)];
  if (unique.length === 0) unique.push('默认章节');
  sel.innerHTML = unique.map(ch =>
    `<option value="${escHtml(ch)}"${ch === selected ? ' selected' : ''}>${escHtml(ch)}</option>`
  ).join('');
}

async function selectNode(id) {
  currentId = id;
  const node = await api(`/api/nodes/${id}`);
  document.getElementById('editorPlaceholder').style.display = 'none';
  document.getElementById('gameConfigEditor').style.display = 'none';
  const ec = document.getElementById('editorContent');
  ec.style.display = 'block';
  document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
  document.getElementById('editNodeId').value = node.node_id;
  document.getElementById('editNodeName').value = node.node_name || '';
  populateChapterSelect(node.chapter || '默认章节');

  const bgVal = typeof node.background === 'object' ? node.background?.value || '' : node.background || '';
  document.getElementById('editBgValue').value = bgVal;
  updateBgPreview();
  document.getElementById('editDialogueBg').value = node.dialogue_bg || '';
  document.getElementById('editDisplayMode').value = node.display_mode || 'dialogue';
  document.getElementById('editTextContent').value = node.text_content || '';
  document.getElementById('editTextMusic').value = node.text_music || '';
  document.getElementById('editNodeMusic').value = node.music || '';
  document.getElementById('editPuzzleMusic').value = node.puzzle_music || '';
  document.getElementById('editShowCreditsAfter').checked = !!node.show_credits_after;
  const isText = (node.display_mode || 'dialogue') === 'text';
  document.getElementById('textModeGroup').style.display = isText ? 'block' : 'none';


  const nextSelect = document.getElementById('editNextNode');
  const allNodes = await loadChapters();
  const currentVal = node.next_node_id || '';
  nextSelect.innerHTML = '<option value="">无 - 未设置</option>' +
    allNodes.filter(n => n.node_id !== id).map(n =>
      `<option value="${n.node_id}"${n.node_id === currentVal ? ' selected' : ''}>${escHtml(n.node_name)} (${n.node_id})</option>`
    ).join('');

  document.getElementById('editQuestion').value = node.puzzle?.question_text || '';
  document.getElementById('editQuestionImage').value = node.puzzle?.question_image || '';
  const qPreview = document.getElementById('questionImagePreview');
  if (node.puzzle?.question_image) {
    qPreview.src = node.puzzle.question_image;
    qPreview.style.display = 'block';
  } else { qPreview.style.display = 'none'; }
  document.getElementById('editAnswer').value = node.puzzle?.correct_answer || '';
  document.getElementById('editMatchRule').value = node.puzzle?.answer_match_rule || 'exact';
  document.getElementById('editMaxAttempts').value = node.puzzle?.max_attempts || '';
  document.getElementById('editErrorHint').value = node.puzzle?.error_hint || '';
  document.getElementById('editClue1').value = (node.puzzle?.clues || [])[0] || '';
  document.getElementById('editClue2').value = (node.puzzle?.clues || [])[1] || '';
  document.getElementById('editClue3').value = (node.puzzle?.clues || [])[2] || '';

  previewIdx = 0;
  renderDialogues(node.dialogues || []);
  renderItems(node.puzzle?.items || []);
  loadChapters();
}

function renderDialogues(dialogues) {
  const container = document.getElementById('dialogueList');
  container.innerHTML = dialogues.map((d, i) => `
    <div class="dialogue-card${i === previewIdx ? ' preview-active' : ''}" data-idx="${i}" onclick="selectPreview(${i})">
      <div class="d-header">
        <span class="d-index">#${i + 1}</span>
        <div class="d-actions">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();moveDialogue(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();moveDialogue(${i}, 1)" ${i === dialogues.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();removeDialogue(${i})">×</button>
        </div>
      </div>
      <div class="d-speaker" style="display:flex;gap:8px;margin-bottom:8px">
        <input class="input" placeholder="说话人" value="${escHtml(d.speaker || '')}" oninput="updateDialogue(${i},'speaker',this.value)" style="flex:1" onclick="event.stopPropagation()">
        <input class="input" placeholder="人物头像URL" value="${d.speaker_avatar || ''}" oninput="updateDialogue(${i},'avatar',this.value)" style="flex:2" onclick="event.stopPropagation()">
      </div>
      <div class="d-text">
        <textarea class="input" rows="2" placeholder="对话文本（≤200字）" oninput="updateDialogue(${i},'text',this.value)" onclick="event.stopPropagation()">${escHtml(d.text)}</textarea>
      </div>
      <div class="d-image">
        <input class="input" placeholder="插入图片URL（可选）" value="${d.insert_image || ''}" oninput="updateDialogue(${i},'image',this.value)" onclick="event.stopPropagation()">
        ${d.insert_image ? `<img src="${d.insert_image}" class="d-image-preview">` : ''}
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();uploadDialogueImg(${i})">上传</button>
      </div>
      <div class="d-speed">
        <label>打字速度:</label>
        <input type="number" class="input" value="${d.typewriter_speed || 20}" min="1" max="100" oninput="updateDialogue(${i},'speed',this.value)" onclick="event.stopPropagation()">
        <label style="margin-left:4px">字/秒</label>
      </div>
    </div>
  `).join('');
  updatePreview();
}

function getDialogues() {
  const cards = document.querySelectorAll('.dialogue-card');
  return Array.from(cards).map(card => {
    const speakerInput = card.querySelector('.d-speaker input:first-child');
    const avatarInput = card.querySelector('.d-speaker input:last-child');
    const textarea = card.querySelector('.d-text textarea');
    const imgInput = card.querySelector('.d-image .input');
    const speedInput = card.querySelector('.d-speed input');
    const text = textarea ? textarea.value : '';
    const insert_image = imgInput ? imgInput.value || null : null;
    const typewriter_speed = speedInput ? parseInt(speedInput.value) || 20 : 20;
    const speaker = speakerInput ? speakerInput.value || null : null;
    const speaker_avatar = avatarInput ? avatarInput.value || null : null;
    return { text, insert_image, typewriter_speed, speaker, speaker_avatar };
  });
}

function updateDialogue(idx, field, value) {
  const dialogues = getDialogues();
  updatePreview();
  autoSave();
}

function addDialogue() {
  const dialogues = getDialogues();
  dialogues.push({ text: '', insert_image: null, typewriter_speed: 20, speaker: null, speaker_avatar: null });
  renderDialogues(dialogues);
  autoSave();
}

function removeDialogue(idx) {
  const dialogues = getDialogues();
  dialogues.splice(idx, 1);
  renderDialogues(dialogues);
  autoSave();
}

function moveDialogue(idx, dir) {
  const dialogues = getDialogues();
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= dialogues.length) return;
  [dialogues[idx], dialogues[newIdx]] = [dialogues[newIdx], dialogues[idx]];
  renderDialogues(dialogues);
  autoSave();
}

async function autoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    if (!currentId) return;
    try {
      await autoSaveNow();
    } catch (e) { console.error('自动保存失败', e); }
  }, 400);
}

async function autoSaveNow() {
  if (!currentId) return;
  const bgValue = document.getElementById('editBgValue').value;
  await api(`/api/nodes/${currentId}`, {
    method: 'PUT',
    body: JSON.stringify({
      node_name: document.getElementById('editNodeName').value,
      chapter: document.getElementById('editChapter').value,
      background: bgValue || null,
      dialogue_bg: document.getElementById('editDialogueBg').value || null,
      display_mode: document.getElementById('editDisplayMode').value,
      text_content: document.getElementById('editTextContent').value,
      text_music: document.getElementById('editTextMusic').value || null,
      music: document.getElementById('editNodeMusic').value || null,
      puzzle_music: document.getElementById('editPuzzleMusic').value || null,
      show_credits_after: document.getElementById('editShowCreditsAfter').checked,
      next_node_id: document.getElementById('editNextNode').value || null
    })
  });
  await api(`/api/nodes/${currentId}/dialogues`, {
    method: 'PUT',
    body: JSON.stringify({ dialogues: getDialogues() })
  });
  await api(`/api/nodes/${currentId}/puzzle`, {
    method: 'PUT',
    body: JSON.stringify({
      question_text: document.getElementById('editQuestion').value,
      question_image: document.getElementById('editQuestionImage').value || null,
      correct_answer: document.getElementById('editAnswer').value,
      answer_match_rule: document.getElementById('editMatchRule').value,
      max_attempts: document.getElementById('editMaxAttempts').value ? parseInt(document.getElementById('editMaxAttempts').value) : null,
      error_hint: document.getElementById('editErrorHint').value,
      clues: [document.getElementById('editClue1').value, document.getElementById('editClue2').value, document.getElementById('editClue3').value].filter(c => c.trim()),
      items: getItems()
    })
  });
  document.getElementById('bgPreview').style.background = bgValue || '#0a0e27';
  loadChapters();
}

async function manualSave() {
  const status = document.getElementById('saveStatus');
  status.textContent = '保存中...';
  status.style.color = '#8892b0';
  try {
    await autoSaveNow();
    status.textContent = '✓ 保存成功';
    status.style.color = '#64ffda';
    await loadChapters();
    if (currentId) await selectNode(currentId);
  } catch (e) {
    status.textContent = '✗ 保存失败: ' + e.message;
    status.style.color = '#ff6b6b';
  }
  setTimeout(() => status.textContent = '', 3000);
}

async function createNodeInChapter(chapterName) {
  const node = await api('/api/nodes', {
    method: 'POST',
    body: JSON.stringify({ node_name: '新节点', chapter: chapterName })
  });
  await selectNode(node.node_id);
}

async function deleteNode() {
  if (!currentId || !confirm('确定删除此节点？')) return;
  await api(`/api/nodes/${currentId}`, { method: 'DELETE' });
  currentId = null;
  document.getElementById('editorContent').style.display = 'none';
  document.getElementById('editorPlaceholder').style.display = 'flex';
  loadChapters();
}

let uploadTarget = null;
let uploadDialogueIdx = null;

function uploadImg(target) {
  uploadTarget = target;
  uploadDialogueIdx = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function uploadDialogueImg(idx) {
  uploadTarget = 'dialogue';
  uploadDialogueIdx = idx;
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function uploadTextMusic() {
  uploadTarget = 'textMusic';
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function playTextMusic() {
  const val = document.getElementById('editTextMusic').value;
  if (!val) return;
  const audio = new Audio(val);
  audio.play().catch(e => alert('播放失败: ' + e.message));
}

function clearTextMusic() {
  document.getElementById('editTextMusic').value = '';
  autoSave();
}

function uploadNodeMusic() {
  uploadTarget = 'nodeMusic';
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function playNodeMusic() {
  const val = document.getElementById('editNodeMusic').value;
  if (!val) return;
  const audio = new Audio(val);
  audio.play().catch(e => alert('播放失败: ' + e.message));
}

function clearNodeMusic() {
  document.getElementById('editNodeMusic').value = '';
  autoSave();
}

function uploadPuzzleMusic() {
  uploadTarget = 'puzzleMusic';
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function playPuzzleMusic() {
  const val = document.getElementById('editPuzzleMusic').value;
  if (!val) return;
  const audio = new Audio(val);
  audio.play().catch(e => alert('播放失败: ' + e.message));
}

function clearPuzzleMusic() {
  document.getElementById('editPuzzleMusic').value = '';
  autoSave();
}

async function applyPuzzleMusicAll() {
  const val = document.getElementById('editPuzzleMusic').value;
  if (!val) { alert('请先设置验证页背景音乐'); return; }
  if (!confirm('确定将验证页背景音乐「' + val.split('/').pop() + '」应用到全部节点？')) return;
  const nodes = await api('/api/nodes');
  for (const n of nodes) {
    await api('/api/nodes/' + n.node_id, { method: 'PUT', body: JSON.stringify({ puzzle_music: val }) });
  }
  alert('已应用到全部 ' + nodes.length + ' 个节点');
}

function uploadCreditsMusic() {
  uploadTarget = 'creditsMusic';
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function playCreditsMusic() {
  const val = document.getElementById('editCreditsMusic').value;
  if (!val) return;
  const audio = new Audio(val);
  audio.play().catch(e => alert('播放失败: ' + e.message));
}

function clearCreditsMusic() {
  document.getElementById('editCreditsMusic').value = '';
  autoSaveGame();
}

function uploadCoverMusic() {
  uploadTarget = 'coverMusic';
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function playCoverMusic() {
  const val = document.getElementById('editCoverMusic').value;
  if (!val) return;
  const audio = new Audio(val);
  audio.play().catch(e => alert('播放失败: ' + e.message));
}

function clearCoverMusic() {
  document.getElementById('editCoverMusic').value = '';
  autoSaveGame();
}

function uploadCoverBg() {
  uploadTarget = 'cover';
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function uploadBgImg() {
  uploadTarget = 'bg';
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('imgUploadModal').style.display = 'none';
}

async function handleUpload() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) return;
  const progress = document.getElementById('uploadProgress');
  progress.textContent = '上传中...';
  const formData = new FormData();
  formData.append('image', file);
  try {
    const headers = {};
    if (adminToken) headers['Authorization'] = adminToken;
    const uploadUrl = currentStoryId ? '/api/upload?story=' + currentStoryId : '/api/upload';
    const res = await fetch(uploadUrl, { method: 'POST', body: formData, headers });
    const data = await res.json();
    if (uploadTarget === 'question') {
      document.getElementById('editQuestionImage').value = data.url;
      document.getElementById('questionImagePreview').src = data.url;
      document.getElementById('questionImagePreview').style.display = 'block';
    } else if (uploadTarget === 'dialogue' && uploadDialogueIdx !== null) {
      const dialogues = getDialogues();
      dialogues[uploadDialogueIdx].insert_image = data.url;
      renderDialogues(dialogues);
    } else if (uploadTarget === 'item' && uploadItemIdx !== null) {
      const items = getItems();
      items[uploadItemIdx].image = data.url;
      renderItems(items);
    } else if (uploadTarget === 'cover') {
      document.getElementById('editCoverBg').value = 'url(' + data.url + ')';
      updateCoverBgPreview();
      autoSaveGame();
    } else if (uploadTarget === 'bg') {
      document.getElementById('editBgValue').value = 'url(' + data.url + ')';
      updateBgPreview();
      autoSave();
    } else if (uploadTarget === 'coverMusic') {
      document.getElementById('editCoverMusic').value = data.url;
      autoSaveGame();
    } else if (uploadTarget === 'textMusic') {
      document.getElementById('editTextMusic').value = data.url;
      autoSave();
    } else if (uploadTarget === 'nodeMusic') {
      document.getElementById('editNodeMusic').value = data.url;
      autoSave();
    } else if (uploadTarget === 'puzzleMusic') {
      document.getElementById('editPuzzleMusic').value = data.url;
      autoSave();
    } else if (uploadTarget === 'creditsMusic') {
      document.getElementById('editCreditsMusic').value = data.url;
      autoSaveGame();
    } else if (uploadTarget === 'music' && uploadMusicChapter) {
      const input = document.querySelector(`.ch-music-input[data-chapter="${uploadMusicChapter}"]`);
      if (input) input.value = data.url;
      renderMusicEditor(getMusicFromInputs());
      autoSaveGame();
    }
    progress.textContent = '上传成功 ✓';
    closeModal();
    autoSave();
  } catch (e) {
    progress.textContent = '上传失败: ' + e.message;
  }
}

function updateBgPreview() {
  const val = document.getElementById('editBgValue').value;
  if (!val) {
    document.getElementById('bgPreview').style.background = '#0a0e27';
  } else if (val.startsWith('#')) {
    document.getElementById('bgPreview').style.background = val;
  } else {
    document.getElementById('bgPreview').style.background = val + ' center/cover';
  }
}

function resetBg() {
  document.getElementById('editBgValue').value = '';
  updateBgPreview();
  autoSave();
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s || '';
  return div.innerHTML;
}

function renderItems(items) {
  const container = document.getElementById('itemsList');
  if (!items || items.length === 0) {
    container.innerHTML = '<div style="color:#4a5580;font-size:13px;padding:8px 0">暂无道具</div>';
    return;
  }
  container.innerHTML = items.map((item, i) => `
    <div class="item-row" data-idx="${i}">
      <input class="input" placeholder="道具名称（可选）" value="${escHtml(item.name || '')}" oninput="updateItem(${i},'name',this.value)" style="flex:1">
      <input class="input" placeholder="图片URL" value="${escHtml(item.image || '')}" oninput="updateItem(${i},'image',this.value)" style="flex:2">
      ${item.image ? `<img src="${escHtml(item.image)}" class="item-preview">` : '<span style="font-size:11px;color:#4a5580;width:40px;text-align:center">无图</span>'}
      <button class="btn btn-sm btn-secondary" onclick="uploadItemImg(${i})">上传</button>
      <button class="btn btn-sm btn-danger" onclick="removeItem(${i})">×</button>
    </div>
  `).join('');
}

function getItems() {
  const rows = document.querySelectorAll('.item-row');
  return Array.from(rows).map(row => ({
    name: row.querySelector('input:first-child').value || null,
    image: row.querySelector('input:nth-child(2)').value || null
  }));
}

function addItem() {
  const items = getItems();
  items.push({ name: '', image: null });
  renderItems(items);
  autoSave();
}

function removeItem(idx) {
  const items = getItems();
  items.splice(idx, 1);
  renderItems(items);
  autoSave();
}

function updateItem(idx, field, value) {
  autoSave();
}

function uploadItemImg(idx) {
  uploadTarget = 'item';
  uploadItemIdx = idx;
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

let uploadItemIdx = null;

function selectPreview(idx) {
  previewIdx = idx;
  const dialogues = getDialogues();
  renderDialogues(dialogues);
}

function updatePreview() {
  const dialogues = getDialogues();
  const d = dialogues[previewIdx];
  if (!d) {
    document.getElementById('previewText').textContent = '选择一条对话预览';
    document.getElementById('previewSpeaker').textContent = '';
    document.getElementById('previewCharArt').style.display = 'none';
    document.getElementById('previewCharName').style.display = 'none';
    return;
  }
  document.getElementById('previewText').textContent = d.text || '（空）';
  document.getElementById('previewSpeaker').textContent = d.speaker || '';
  const charArt = document.getElementById('previewCharArt');
  const charName = document.getElementById('previewCharName');
  const avatarUrl = d.insert_image || d.speaker_avatar || null;
  if (avatarUrl) {
    charArt.src = avatarUrl;
    charArt.style.display = 'block';
    charName.textContent = d.speaker || '';
    charName.style.display = 'block';
  } else {
    charArt.style.display = 'none';
    charName.style.display = 'none';
  }
}

function showGameConfig() {
  document.getElementById('commentsView').style.display = 'none';
  document.getElementById('codesView').style.display = 'none';
  document.getElementById('editorContent').style.display = 'none';
  document.getElementById('editorPlaceholder').style.display = 'none';
  document.getElementById('gameConfigEditor').style.display = 'block';
  loadGameConfig();
  document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
  document.querySelector('.sidebar-menu-item').classList.add('active');
  document.querySelectorAll('.node-item').forEach(i => i.classList.remove('active'));
  currentId = null;
}

function showComments() {
  document.getElementById('editorContent').style.display = 'none';
  document.getElementById('editorPlaceholder').style.display = 'none';
  document.getElementById('gameConfigEditor').style.display = 'none';
  document.getElementById('codesView').style.display = 'none';
  document.getElementById('commentsView').style.display = 'block';
  document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.sidebar-menu-item')[2].classList.add('active');
  document.querySelectorAll('.node-item').forEach(i => i.classList.remove('active'));
  currentId = null;
  loadComments();
}

function showCodes() {
  document.getElementById('editorContent').style.display = 'none';
  document.getElementById('editorPlaceholder').style.display = 'none';
  document.getElementById('gameConfigEditor').style.display = 'none';
  document.getElementById('commentsView').style.display = 'none';
  document.getElementById('codesView').style.display = 'block';
  document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.sidebar-menu-item')[1].classList.add('active');
  document.querySelectorAll('.node-item').forEach(i => i.classList.remove('active'));
  currentId = null;
  loadCodes();
}

async function loadCodes() {
  const container = document.getElementById('codesList');
  try {
    const codes = await api('/api/admin/codes');
    if (codes.length === 0) {
      container.innerHTML = '<div style="color:#4a5580;padding:40px;text-align:center">暂无验证码</div>';
      return;
    }
    container.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
      '<tr style="color:#8892b0;border-bottom:1px solid #1a2040">' +
        '<th style="padding:8px 12px;text-align:left">验证码</th>' +
        '<th style="padding:8px 12px;text-align:left">状态</th>' +
        '<th style="padding:8px 12px;text-align:left">生成时间</th>' +
        '<th style="padding:8px 12px;text-align:left">使用时间</th>' +
        '<th style="padding:8px 12px;text-align:right">操作</th>' +
      '</tr>' +
      codes.map(c => '<tr style="border-bottom:1px solid #141834">' +
        '<td style="padding:8px 12px;color:#64ffda;font-family:monospace;font-size:15px;letter-spacing:2px">' + escHtml(c.code) + '</td>' +
        '<td style="padding:8px 12px">' + (c.used ? '<span style="color:#ff4757">已使用</span>' : '<span style="color:#64ffda">未使用</span>') + '</td>' +
        '<td style="padding:8px 12px;color:#8892b0;font-size:12px">' + new Date(c.created_at).toLocaleString() + '</td>' +
        '<td style="padding:8px 12px;color:#8892b0;font-size:12px">' + (c.used_at ? new Date(c.used_at).toLocaleString() : '-') + '</td>' +
        '<td style="padding:8px 12px;text-align:right"><button class="btn btn-xs btn-danger" onclick="deleteCode(\'' + c.id + '\')">删除</button></td>' +
      '</tr>').join('') +
      '</table>';
    document.getElementById('codeStatus').textContent = '共 ' + codes.length + ' 个验证码，' + codes.filter(c => c.used).length + ' 个已使用';
  } catch (e) {
    container.innerHTML = '<div style="color:#ff4757;padding:20px">加载失败: ' + e.message + '</div>';
  }
}

async function generateCodes() {
  const count = parseInt(document.getElementById('codeCount').value);
  document.getElementById('codeStatus').textContent = '生成中...';
  try {
    const result = await api('/api/admin/codes', {
      method: 'POST',
      body: JSON.stringify({ count })
    });
    document.getElementById('codeStatus').textContent = '✅ 已生成 ' + result.codes.length + ' 个验证码';
    loadCodes();
  } catch (e) {
    document.getElementById('codeStatus').textContent = '生成失败: ' + e.message;
  }
}

async function deleteCode(id) {
  if (!confirm('确定删除此验证码？')) return;
  try {
    await api('/api/admin/codes/' + id, { method: 'DELETE' });
    loadCodes();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

async function exportCodes() {
  try {
    const codes = await api('/api/admin/codes');
    const unused = codes.filter(c => !c.used);
    if (unused.length === 0) { alert('没有未使用的验证码可导出'); return; }
    const lines = unused.map(c => c.code);
    const blob = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '验证码_' + new Date().toISOString().slice(0,10) + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败: ' + e.message);
  }
}

async function loadComments() {
  const container = document.getElementById('commentsList');
  try {
    const comments = await api('/api/comments');
    if (comments.length === 0) {
      container.innerHTML = '<div style="color:#4a5580;padding:40px;text-align:center">暂无留言</div>';
      return;
    }
    container.innerHTML = comments.map(c => `
      <div style="background:#141834;border:1px solid #1a2040;border-radius:8px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="color:#64ffda;font-weight:bold">${escHtml(c.name)}</span>
          ${c.rating ? '<span style="color:#ffd700">' + '★'.repeat(c.rating) + '☆'.repeat(5-c.rating) + '</span>' : ''}
        </div>
        ${c.child_age ? '<div style="color:#8892b0;font-size:12px;margin-bottom:6px">年龄: ' + escHtml(c.child_age) + '</div>' : ''}
        <div style="color:#ccd6f6;font-size:14px;line-height:1.6;margin-bottom:8px">${escHtml(c.content)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:#4a5580;font-size:12px">${new Date(c.time).toLocaleString()}</span>
          <button class="btn btn-xs btn-danger" onclick="deleteComment('${c.id}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = '<div style="color:#ff4757;padding:20px">加载失败: ' + e.message + '</div>';
  }
}

async function deleteComment(id) {
  if (!confirm('确定删除此留言？')) return;
  await api('/api/comments/' + id, { method: 'DELETE' });
  loadComments();
}

async function loadGameConfig() {
  try {
    const cfg = await api('/api/game-config');
    document.getElementById('editGameName').value = cfg.game_name || '';
    document.getElementById('editCoverTitle').value = cfg.cover_title || '';
    document.getElementById('editCoverSubtitle').value = cfg.cover_subtitle || '';
    document.getElementById('editCoverBtnText').value = cfg.cover_button_text || '';
    document.getElementById('editCoverBg').value = cfg.cover_background || '';
    updateCoverBgPreview();
    document.getElementById('editCoverMusic').value = cfg.cover_music || '';
    document.getElementById('editCreditsLines').value = (cfg.credits?.lines || []).join('\n');
    document.getElementById('editCreditsMusic').value = cfg.credits?.music || '';
    renderSubtitleEditor(cfg.chapter_subtitles || {});
    renderMusicEditor(cfg.chapter_music || {});
  } catch (e) { console.error('加载游戏配置失败', e); }
}

function renderSubtitleEditor(subtitles) {
  const container = document.getElementById('chapterSubtitleEditor');
  const chapters = document.querySelectorAll('.chapter-header .chapter-name');
  const names = [...new Set(Array.from(chapters).map(el => el.textContent))];
  if (names.length === 0) { container.innerHTML = '<div style="color:#4a5580;font-size:13px">暂无章节</div>'; return; }
  container.innerHTML = names.map(ch =>
    `<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
      <span style="width:80px;font-size:13px;color:#64ffda;flex-shrink:0">${escHtml(ch)}</span>
      <input class="input ch-sub-input" data-chapter="${escHtml(ch)}" value="${escHtml(subtitles[ch] || '')}" placeholder="副标题（可选）" style="flex:1">
    </div>`
  ).join('');
}

function renderMusicEditor(music) {
  const container = document.getElementById('chapterMusicEditor');
  const chapters = document.querySelectorAll('.chapter-header .chapter-name');
  const names = [...new Set(Array.from(chapters).map(el => el.textContent))];
  if (names.length === 0) { container.innerHTML = '<div style="color:#4a5580;font-size:13px">暂无章节</div>'; return; }
  container.innerHTML = names.map(ch =>
    `<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">
      <span style="width:80px;font-size:13px;color:#64ffda;flex-shrink:0">${escHtml(ch)}</span>
      <input class="input ch-music-input" data-chapter="${escHtml(ch)}" value="${escHtml(music[ch] || '')}" placeholder="音乐URL或留空" style="flex:1" readonly onclick="uploadChapterMusic('${escHtml(ch)}')">
      ${music[ch] ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();playChapterMusic('${escHtml(ch)}')">▶</button><button class="btn btn-sm btn-danger" onclick="event.stopPropagation();clearChapterMusic('${escHtml(ch)}')">×</button>` : ''}
    </div>`
  ).join('');
}

function uploadChapterMusic(chapterName) {
  uploadTarget = 'music';
  uploadMusicChapter = chapterName;
  document.getElementById('fileInput').value = '';
  document.getElementById('imgUploadModal').style.display = 'flex';
}

let uploadMusicChapter = null;

function playChapterMusic(chapterName) {
  const input = document.querySelector(`.ch-music-input[data-chapter="${chapterName}"]`);
  if (!input || !input.value) return;
  const audio = new Audio(input.value);
  audio.play().catch(e => alert('播放失败: ' + e.message));
}

function clearChapterMusic(chapterName) {
  const input = document.querySelector(`.ch-music-input[data-chapter="${chapterName}"]`);
  if (input) input.value = '';
  renderMusicEditor(getMusicFromInputs());
  autoSaveGame();
}

function getMusicFromInputs() {
  const music = {};
  document.querySelectorAll('.ch-music-input').forEach(inp => {
    const val = inp.value.trim();
    if (val) music[inp.dataset.chapter] = val;
  });
  return music;
}

function updateCoverBgPreview() {
  const val = document.getElementById('editCoverBg').value;
  document.getElementById('coverBgPreview').style.background = val || 'linear-gradient(135deg,#0a0e27 0%,#1a1040 50%,#0a0e27 100%)';
}

let gameSaveTimer = null;

function autoSaveGame() {
  clearTimeout(gameSaveTimer);
  gameSaveTimer = setTimeout(async () => {
    try { await saveGameConfig(); } catch (e) {}
  }, 400);
}

async function saveGameConfig() {
  const subtitles = {};
  document.querySelectorAll('.ch-sub-input').forEach(inp => {
    const ch = inp.dataset.chapter;
    const val = inp.value.trim();
    if (val) subtitles[ch] = val;
  });
  const music = getMusicFromInputs();
  const creditsLines = document.getElementById('editCreditsLines').value.split('\n').filter(l => l.trim());
  const creditsMusic = document.getElementById('editCreditsMusic').value || null;
  await api('/api/game-config', {
    method: 'PUT',
    body: JSON.stringify({
      game_name: document.getElementById('editGameName').value,
      cover_title: document.getElementById('editCoverTitle').value,
      cover_subtitle: document.getElementById('editCoverSubtitle').value,
      cover_button_text: document.getElementById('editCoverBtnText').value,
      cover_background: document.getElementById('editCoverBg').value,
      cover_music: document.getElementById('editCoverMusic').value || null,
      chapter_subtitles: subtitles,
      chapter_music: music,
      credits: creditsLines.length ? { lines: creditsLines, music: creditsMusic } : { lines: [], music: null }
    })
  });
}

async function manualSaveGame() {
  const status = document.getElementById('gameSaveStatus');
  status.textContent = '保存中...';
  status.style.color = '#8892b0';
  try {
    await saveGameConfig();
    status.textContent = '✓ 保存成功';
    status.style.color = '#64ffda';
  } catch (e) {
    status.textContent = '✗ 保存失败: ' + e.message;
    status.style.color = '#ff6b6b';
  }
  setTimeout(() => status.textContent = '', 3000);
}

async function doLogin() {
  const pwd = document.getElementById('loginPwd').value;
  document.getElementById('loginError').textContent = '';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (!res.ok) { document.getElementById('loginError').textContent = data.error || '登录失败'; return; }
    adminToken = data.token;
    localStorage.setItem('admin_token', data.token);
    document.getElementById('loginOverlay').style.display = 'none';
    loadChapters();
    loadGameConfig();
  } catch (e) {
    document.getElementById('loginError').textContent = '连接失败: ' + e.message;
  }
}

async function changePassword() {
  const oldPwd = document.getElementById('editOldPwd').value;
  const newPwd = document.getElementById('editNewPwd').value;
  const status = document.getElementById('pwdStatus');
  if (!oldPwd || !newPwd) { status.textContent = '请填写完整'; status.style.color = '#ff4757'; return; }
  if (newPwd.length < 4) { status.textContent = '新密码至少4个字符'; status.style.color = '#ff4757'; return; }
  status.textContent = '修改中...';
  status.style.color = '#8892b0';
  try {
    const res = await api('/api/admin/password', {
      method: 'PUT',
      body: JSON.stringify({ old_password: oldPwd, new_password: newPwd })
    });
    if (!res.success) { status.textContent = '修改失败'; status.style.color = '#ff4757'; return; }
    localStorage.removeItem('admin_token');
    adminToken = null;
    status.textContent = '密码已修改，请重新登录';
    status.style.color = '#64ffda';
    document.getElementById('editOldPwd').value = '';
    document.getElementById('editNewPwd').value = '';
    setTimeout(() => { document.getElementById('loginOverlay').style.display = 'flex'; }, 1500);
  } catch (e) {
    status.textContent = '修改失败: ' + e.message;
    status.style.color = '#ff4757';
  }
}

async function initAdmin() {
  if (!adminToken) { document.getElementById('loginOverlay').style.display = 'flex'; return; }
  try {
    const res = await fetch('/api/admin/check-token', {
      headers: { 'Authorization': adminToken }
    });
    if (!res.ok) { localStorage.removeItem('admin_token'); adminToken = null; document.getElementById('loginOverlay').style.display = 'flex'; return; }
    document.getElementById('loginOverlay').style.display = 'none';
    currentStoryId = localStorage.getItem('admin_story_id') || '';
    await loadStories();
    loadGameConfig();
  } catch {
    document.getElementById('loginOverlay').style.display = 'flex';
  }
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

document.getElementById('editBgValue').addEventListener('input', updateBgPreview);
document.getElementById('editDisplayMode').addEventListener('change', function() {
  document.getElementById('textModeGroup').style.display = this.value === 'text' ? 'block' : 'none';
});

initAdmin();