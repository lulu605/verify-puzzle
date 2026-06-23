let currentNode = null;
let currentDialogueIdx = 0;
let isTyping = false;
let attempts = 0;
let isPaused = false;
let dialogueHistory = [];
let inventory = [];
let gameConfig = {};
let currentChapterMusic = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

let audioCtx = null;
let bgSource = null;
let bgGain = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

async function playMusic(url) {
  try {
    if (bgSource) { bgSource.stop(); bgSource.disconnect(); bgSource = null; }
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const resp = await fetch(url);
    const buf = await resp.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(buf);
    bgGain = ctx.createGain();
    bgGain.gain.value = 0.3;
    bgSource = ctx.createBufferSource();
    bgSource.buffer = audioBuf;
    bgSource.loop = true;
    bgSource.connect(bgGain).connect(ctx.destination);
    bgSource.start();
  } catch (e) { console.warn('Audio error', e); }
}

function stopMusic() {
  if (bgSource) { try { bgSource.stop(); } catch(e){} bgSource.disconnect(); bgSource = null; }
}

function enterSite() {
  document.getElementById('entryOverlay').style.display = 'none';
  if (gameConfig.cover_music) {
    currentChapterMusic = gameConfig.cover_music;
    playMusic(gameConfig.cover_music);
  }
}

async function init() {
  const [nodes, gameCfg] = await Promise.all([
    api('/api/nodes'),
    api('/api/game-config')
  ]);
  const sel = document.getElementById('nodeSelector');
  sel.innerHTML = nodes.map(n =>
    `<option value="${n.node_id}">${n.chapter ? '【' + n.chapter + '】' : ''}${n.node_name}</option>`
  ).join('');
  generateStars();

  const cover = document.querySelector('.cover');
  if (gameCfg.cover_background) {
    cover.style.background = gameCfg.cover_background + ' center/cover no-repeat';
  }
  const title = document.querySelector('.cover-title');
  if (gameCfg.cover_title) title.textContent = gameCfg.cover_title;
  const sub = document.querySelector('.cover-subtitle');
  if (gameCfg.cover_subtitle) sub.textContent = gameCfg.cover_subtitle;
  const btn = document.querySelector('.cover-btn');
  if (gameCfg.cover_button_text) btn.textContent = gameCfg.cover_button_text;
  document.title = gameCfg.game_name || '验证谜题';
  gameConfig = gameCfg;

  // localStorage auto-restore disabled for testing
  // const savedNodeId = localStorage.getItem('puzzle_current_node');
  // const savedInventory = localStorage.getItem('puzzle_inventory');
  // if (savedInventory) {
  //   try { inventory = JSON.parse(savedInventory); } catch(e) { inventory = []; }
  // }
  // if (savedNodeId) {
  //   try {
  //     currentNode = await api('/api/nodes/' + savedNodeId);
  //     document.getElementById('coverScreen').style.display = 'none';
  //     const chapterName = currentNode.chapter || '';
  //     if (chapterName && chapterName !== (nodes[0]?.chapter || '')) {
  //       const subtitles = gameCfg.chapter_subtitles || {};
  //       document.getElementById('chapterTitleText').textContent = chapterName;
  //       document.getElementById('chapterSubtitleText').textContent = subtitles[chapterName] || '';
  //       document.getElementById('chapterTitleOverlay').style.display = 'flex';
  //       await delay(1500);
  //       document.getElementById('chapterTitleOverlay').classList.add('fade-out');
  //       await delay(500);
  //       document.getElementById('chapterTitleOverlay').style.display = 'none';
  //       document.getElementById('chapterTitleOverlay').classList.remove('fade-out');
  //     }
  //     loadNode(savedNodeId);
  //   } catch(e) {
  //     localStorage.removeItem('puzzle_current_node');
  //     localStorage.removeItem('puzzle_inventory');
  //   }
  // }
}

function generateStars() {
  const container = document.getElementById('coverStars');
  for (let i = 0; i < 60; i++) {
    const star = document.createElement('span');
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    star.style.animationDelay = Math.random() * 3 + 's';
    star.style.width = star.style.height = (Math.random() * 2 + 1) + 'px';
    container.appendChild(star);
  }
}

async function startGame() {
  inventory = [];
  localStorage.removeItem('puzzle_current_node');
  localStorage.removeItem('puzzle_inventory');
  document.getElementById('coverScreen').style.display = 'none';
  const nodes = await api('/api/nodes');
  const firstNode = nodes[0];
  const chapterName = firstNode?.chapter || '';
  if (chapterName) {
    const gameCfg = await api('/api/game-config');
    const subtitles = gameCfg.chapter_subtitles || {};
    document.getElementById('chapterTitleText').textContent = chapterName;
    document.getElementById('chapterSubtitleText').textContent = subtitles[chapterName] || '';
    document.getElementById('chapterTitleOverlay').style.display = 'flex';
    await delay(1500);
    document.getElementById('chapterTitleOverlay').classList.add('fade-out');
    await delay(500);
    document.getElementById('chapterTitleOverlay').style.display = 'none';
    document.getElementById('chapterTitleOverlay').classList.remove('fade-out');
  }
  if (nodes.length > 0) loadNode(nodes[0].node_id);
}

async function loadNode(nodeId) {
  currentNode = await api(`/api/nodes/${nodeId}`);
  // localStorage auto-save disabled for testing
  // localStorage.setItem('puzzle_current_node', nodeId);
  // localStorage.setItem('puzzle_inventory', JSON.stringify(inventory));
  currentDialogueIdx = 0;
  attempts = 0;
  isPaused = false;

  document.querySelectorAll('.success-overlay').forEach(el => el.remove());
  closeHistory();
  applyBackground(currentNode.background);
  applyDialogueBg(currentNode.dialogue_bg);
  const box = document.getElementById('dialogueBox');
  box.style.cssText = '';
  document.querySelector('.character-area').style.display = '';
  document.getElementById('speakerLabel').style.display = '';
  document.getElementById('dialoguePhase').style.display = 'flex';
  document.getElementById('puzzleArea').style.display = 'none';
  document.getElementById('puzzleError').textContent = '';
  document.getElementById('puzzleInput').value = '';
  document.getElementById('puzzleInput').className = 'puzzle-input';
  document.getElementById('puzzleInput').disabled = false;
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('puzzleAttempts').textContent = '';
  document.getElementById('clueContainer').innerHTML = '';

  dialogueHistory = [];
  document.getElementById('backpackBtn').style.display = 'flex';
  document.getElementById('puzzleAnswerReveal').style.display = 'none';
  document.getElementById('puzzleCorrectAnswer').style.display = 'none';
  document.getElementById('nextAfterFailBtn').style.display = 'none';
  document.getElementById('revealBtn').style.display = 'block';
  document.getElementById('historyBtn').style.display = 'none';
  document.getElementById('goPuzzleBtn').style.display = 'none';
  document.getElementById('charArt').style.display = 'none';
  document.getElementById('charNameTag').style.display = 'none';
  renderProgress(currentNode.dialogues.length);
  playChapterMusic(currentNode.chapter);
  await playDialogues();
}

function applyBackground(bg) {
  const body = document.body;
  if (!bg) {
    body.style.background = '#0a0e27';
    return;
  }
  if (typeof bg === 'object') {
    if (bg.type === 'color') {
      body.style.background = bg.value || '#0a0e27';
      body.style.backgroundImage = 'none';
    } else if (bg.type === 'image') {
      body.style.backgroundImage = 'url(' + bg.value + ')';
      body.style.backgroundSize = 'cover';
      body.style.backgroundPosition = 'center';
      body.style.backgroundAttachment = 'fixed';
    }
    return;
  }
  if (bg.startsWith('#')) {
    body.style.background = bg;
    body.style.backgroundImage = 'none';
  } else {
    body.style.background = bg + ' center/cover no-repeat fixed';
  }
}

function playCoverMusic() {
  if (!gameConfig.cover_music) return;
  if (currentChapterMusic === gameConfig.cover_music) return;
  currentChapterMusic = gameConfig.cover_music;
  playMusic(gameConfig.cover_music);
}

function applyDialogueBg(val) {
  const box = document.getElementById('dialogueBox');
  if (!val) {
    box.style.background = 'rgba(0,0,0,0.7)';
    box.style.backdropFilter = 'blur(8px)';
  } else {
    box.style.background = val;
    box.style.backdropFilter = 'none';
  }
}

function playChapterMusic(chapterName) {
  const musicUrl = (gameConfig.chapter_music || {})[chapterName];
  if (!musicUrl) {
    stopMusic();
    currentChapterMusic = null;
    return;
  }
  if (musicUrl === currentChapterMusic) return;
  currentChapterMusic = musicUrl;
  playMusic(musicUrl);
}

function renderProgress(count) {
  const container = document.getElementById('progressDots');
  container.innerHTML = Array.from({ length: count }, (_, i) =>
    `<div class="d-progress-dot${i === 0 ? ' active' : ''}"></div>`
  ).join('');
}

async function playDialogues() {
  const dialogues = currentNode.dialogues;
  document.getElementById('dialogueContainer').innerHTML = '';
  document.getElementById('goPuzzleBtn').style.display = 'none';
  if (currentNode.display_mode === 'text') {
    if (currentNode.text_music) playMusic(currentNode.text_music);
    const lines = (currentNode.text_content || '').split('\n').filter(l => l.trim());
    playTextLines(lines);
    return;
  }

  const box = document.getElementById('dialogueBox');
  const charArea = document.querySelector('.character-area');
  const speakerLabel = document.getElementById('speakerLabel');

  if (!dialogues || dialogues.length === 0) {
    showPuzzle();
    return;
  }
    charArea.style.display = '';
    speakerLabel.style.display = '';
    box.style.cssText = '';
  }

  for (let i = currentDialogueIdx; i < dialogues.length; i++) {
    if (isPaused) return;
    currentDialogueIdx = i;

    const d = dialogues[i];
    const speaker = d.speaker || '???';
    const avatar = d.insert_image || d.speaker_avatar || null;
    let text = d.text || '';
    const prefix = speaker + '：';
    if (text.startsWith(prefix)) text = text.slice(prefix.length);

    if (!isTextMode) {
      document.getElementById('speakerLabel').textContent = speaker;
      const charArt = document.getElementById('charArt');
      const nameTag = document.getElementById('charNameTag');
      if (avatar) {
        charArt.src = avatar;
        charArt.style.display = 'block';
        nameTag.textContent = speaker;
        nameTag.style.display = 'block';
      } else {
        charArt.style.display = 'none';
        nameTag.style.display = 'none';
      }
    }

    document.getElementById('dialogueContainer').innerHTML = '';
    const entry = document.createElement('div');
    entry.className = 'dialogue-entry';
    entry.innerHTML = `<div class="dialogue-text" id="typingTarget"></div>`;
    if (isTextMode) {
      entry.style.textAlign = 'center';
      entry.querySelector('.dialogue-text').style.fontSize = '22px';
      entry.querySelector('.dialogue-text').style.color = '#64ffda';
      entry.querySelector('.dialogue-text').style.lineHeight = '2';
    }
    document.getElementById('dialogueContainer').appendChild(entry);

    document.getElementById('clickHint').style.display = 'none';

    updateProgress(i);

    await typeText(entry.querySelector('.dialogue-text'), text, d.typewriter_speed || 20);

    dialogueHistory.push({ text, image: null, speaker, avatar });

    if (i < dialogues.length - 1) {
      document.getElementById('clickHint').style.display = 'block';
      await waitForClick(document.getElementById('dialogueBox'));
    }
  }

  document.getElementById('clickHint').style.display = 'none';

  if (isTextMode && currentNode.show_credits_after) {
    const credits = gameConfig.credits;
    if (credits && credits.lines && credits.lines.length > 0) {
      showCredits(credits);
      return;
    }
  }

  document.getElementById('goPuzzleBtn').style.display = 'block';
  document.getElementById('historyBtn').style.display = 'block';

  box.scrollTop = box.scrollHeight;
}

async function playTextLines(lines) {
  const box = document.getElementById('dialogueBox');
  document.querySelector('.character-area').style.display = 'none';
  document.getElementById('speakerLabel').style.display = 'none';
  box.style.cssText = 'width:100%;height:100%;min-height:0;max-height:none;display:flex;align-items:center;justify-content:center;background:transparent;backdrop-filter:none;border:none';
  document.getElementById('progressDots').innerHTML = '';
  document.getElementById('dialogueContainer').innerHTML = '';

  for (let i = 0; i < lines.length; i++) {
    currentDialogueIdx = i;
    document.getElementById('dialogueContainer').innerHTML = '';
    const entry = document.createElement('div');
    entry.className = 'dialogue-entry';
    entry.style.textAlign = 'center';
    entry.innerHTML = `<div class="dialogue-text" id="typingTarget" style="font-size:22px;color:#64ffda;line-height:2"></div>`;
    document.getElementById('dialogueContainer').appendChild(entry);
    document.getElementById('clickHint').style.display = 'none';
    await typeText(entry.querySelector('.dialogue-text'), lines[i], 20);
    if (i < lines.length - 1) {
      document.getElementById('clickHint').style.display = 'block';
      await waitForClick(box);
    }
  }

  document.getElementById('clickHint').style.display = 'none';
  if (currentNode.show_credits_after) {
    const credits = gameConfig.credits;
    if (credits && credits.lines && credits.lines.length > 0) {
      showCredits(credits);
      return;
    }
  }
  document.getElementById('goPuzzleBtn').style.display = 'block';
  document.getElementById('historyBtn').style.display = 'block';
}

function waitForClick(el) {
  return new Promise(resolve => {
    const handler = () => { el.removeEventListener('click', handler); resolve(); };
    el.addEventListener('click', handler);
  });
}

function typeText(el, text, speed) {
  return new Promise(resolve => {
    el.textContent = '';
    el.classList.add('cursor');
    isTyping = true;
    let idx = 0;
    const interval = 1000 / speed;

    function tick() {
      if (isPaused) { setTimeout(() => tick(), 100); return; }
      if (idx < text.length) {
        el.textContent += text[idx];
        idx++;
        setTimeout(tick, interval);
      } else {
        isTyping = false;
        el.classList.remove('cursor');
        resolve();
      }
    }
    tick();
  });
}

function showImage(entry, url) {
  return new Promise(resolve => {
    const img = document.createElement('img');
    img.className = 'dialogue-image';
    img.style.display = 'none';
    entry.appendChild(img);
    img.src = url;
    img.onload = () => {
      img.style.display = 'block';
      document.getElementById('dialogueBox').scrollTop = document.getElementById('dialogueBox').scrollHeight;
      resolve();
    };
    img.onerror = () => {
      img.remove();
      resolve();
    };
    if (img.complete && img.naturalWidth > 0) {
      img.style.display = 'block';
      resolve();
    }
  });
}

function updateProgress(idx) {
  const dots = document.querySelectorAll('.d-progress-dot');
  dots.forEach((dot, i) => {
    dot.className = 'd-progress-dot';
    if (i < idx) dot.classList.add('done');
    if (i === idx) dot.classList.add('active');
  });
}

function showPuzzle() {
  document.getElementById('dialoguePhase').style.display = 'none';
  document.getElementById('puzzleArea').style.display = 'flex';
  const puzzle = currentNode.puzzle;
  document.getElementById('puzzleQuestion').textContent = puzzle.question_text || '请输入答案';

  const pImg = document.getElementById('puzzleImage');
  if (puzzle.question_image) {
    pImg.src = puzzle.question_image;
    pImg.style.display = 'block';
  } else {
    pImg.style.display = 'none';
  }

  document.getElementById('puzzleError').textContent = '';

  document.getElementById('puzzleInput').focus();
}

async function submitAnswer() {
  if (!currentNode) return;
  const input = document.getElementById('puzzleInput');
  const answer = input.value.trim();
  if (!answer) { shake(input); return; }

  document.getElementById('submitBtn').disabled = true;
  document.getElementById('puzzleError').textContent = '验证中...';

  try {
    const result = await api('/api/verify', {
      method: 'POST',
      body: JSON.stringify({ node_id: currentNode.node_id, answer })
    });

    attempts++;

    if (result.correct) {
      showSuccess(result);
    } else {
      input.className = 'puzzle-input error';
      document.getElementById('puzzleError').textContent = result.message || '答案不对，再想想！';

      const clues = currentNode.puzzle?.clues || [];
      const clueIdx = attempts - 1;
      if (clues[clueIdx]) {
        showClue(clues[clueIdx], clueIdx);
      }

      const maxA = currentNode.puzzle.max_attempts;
      if (maxA && attempts >= maxA) {
        document.getElementById('puzzleAnswerReveal').style.display = 'block';
      }
      document.getElementById('submitBtn').disabled = false;
      input.focus();
      setTimeout(() => input.className = 'puzzle-input', 500);
    }
  } catch (e) {
    document.getElementById('puzzleError').textContent = '验证失败: ' + e.message;
    document.getElementById('submitBtn').disabled = false;
  }
}

async function getNextAuto() {
  const allNodes = await api('/api/nodes');
  const myIdx = allNodes.findIndex(n => n.node_id === currentNode.node_id);
  if (myIdx >= 0 && myIdx < allNodes.length - 1) {
    const next = allNodes[myIdx + 1];
    if (next.chapter === currentNode.chapter) return { node_id: next.node_id };
    return { node_id: next.node_id, chapter: next.chapter };
  }
  return null;
}

async function showChapterOverlay(chapterName) {
  const subtitles = gameConfig.chapter_subtitles || {};
  document.getElementById('chapterTitleText').textContent = chapterName;
  document.getElementById('chapterSubtitleText').textContent = subtitles[chapterName] || '';
  document.getElementById('chapterTitleOverlay').style.display = 'flex';
  await delay(1500);
  document.getElementById('chapterTitleOverlay').classList.add('fade-out');
  await delay(500);
  document.getElementById('chapterTitleOverlay').style.display = 'none';
  document.getElementById('chapterTitleOverlay').classList.remove('fade-out');
}

async function showSuccess(result) {
  const nodeItems = currentNode?.puzzle?.items || [];
  let newItems = [];
  nodeItems.forEach(item => {
    if (item.image && !inventory.find(i => i.image === item.image)) {
      inventory.push({ ...item });
      newItems.push(item);
    }
  });

  if (result.next_node_id) {
    if (newItems.length) showToast('🎁 获得 ' + newItems.map(i => i.name).join('、') + '，打开背包查看');
    const nextNode = await api('/api/nodes/' + result.next_node_id);
    if (nextNode && nextNode.chapter && nextNode.chapter !== currentNode.chapter) {
      await showChapterOverlay(nextNode.chapter);
      loadNode(result.next_node_id);
    } else {
      const overlay = document.createElement('div');
      overlay.className = 'success-overlay';
      overlay.innerHTML = `<div class="success-content"><h2>✓ 回答正确!</h2><p>即将进入下一节点...</p></div>`;
      document.getElementById('app').appendChild(overlay);
      await delay(800);
      overlay.remove();
      loadNode(result.next_node_id);
    }
    return;
  }

  const nextAuto = await getNextAuto();
  if (nextAuto) {
    if (newItems.length) showToast('🎁 获得 ' + newItems.map(i => i.name).join('、') + '，打开背包查看');
    if (nextAuto.chapter) await showChapterOverlay(nextAuto.chapter);
    loadNode(nextAuto.node_id);
    return;
  }

  const credits = gameConfig.credits;
  if (credits && credits.lines && credits.lines.length > 0) {
    if (newItems.length) showToast('🎁 获得 ' + newItems.map(i => i.name).join('、') + '，打开背包查看');
    showCredits(credits);
    return;
  }

  const allNodes = await api('/api/nodes');
  const overlay = document.createElement('div');
  overlay.className = 'success-overlay';

  let nodeBtns = '';
  const others = allNodes.filter(n => n.node_id !== currentNode.node_id);
  if (others.length > 0) {
    nodeBtns = others
      .map(n => `<button class="node-opt-btn" onclick="loadNode('${n.node_id}')">${n.chapter ? '【' + n.chapter + '】' : ''}${n.node_name}</button>`)
      .join('');
  } else {
    nodeBtns = '<p style="color:#8892b0;font-size:14px">没有其他可跳转的节点</p>';
  }

  overlay.innerHTML = `
    <div class="success-content">
      <h2>✓ 回答正确!</h2>
      ${newItems.length ? `<p style="font-size:14px;color:#ffd700;margin-top:4px">🎁 获得道具: ${newItems.map(i => i.name).join('、')}</p>` : ''}
      <p>${result.message || '恭喜通关！选择要前往的节点：'}</p>
      <div class="node-options">${nodeBtns}</div>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  document.getElementById('app').appendChild(overlay);
}

function showHistory() {
  const body = document.getElementById('historyBody');
  body.innerHTML = dialogueHistory.map(({ text, image, speaker, avatar }) => {
    const avatarHtml = avatar ? `<img src="${escHtml(avatar)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px">` : '';
    const spkHtml = speaker ? `<div style="margin-bottom:4px">${avatarHtml}<span style="color:#64ffda;font-size:13px;font-weight:bold">${escHtml(speaker)}</span></div>` : '';
    const imgHtml = image ? `<img class="h-image" src="${escHtml(image)}" onerror="this.style.display='none'">` : '';
    return `<div class="h-entry">${spkHtml}<div class="h-text">${escHtml(text)}</div>${imgHtml}</div>`;
  }).join('');
  document.getElementById('historyOverlay').style.display = 'block';
}

function closeHistory() {
  document.getElementById('historyOverlay').style.display = 'none';
}

function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function shake(el) {
  el.className = 'puzzle-input error';
  setTimeout(() => el.className = 'puzzle-input', 400);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function showBackpack() {
  const items = inventory;
  const body = document.getElementById('backpackBody');
  if (items.length === 0) {
    body.innerHTML = '<div style="text-align:center;color:#4a5580;padding:40px 0">暂无道具</div>';
  } else {
    body.innerHTML = '<div class="backpack-grid">' + items.map(item => `
      <div class="backpack-item" onclick="enlargeItem('${escHtml(item.image)}','${escHtml(item.name||'')}')">
        <img src="${escHtml(item.image)}" onerror="this.style.display='none'">
        ${item.name ? `<div class="item-name">${escHtml(item.name)}</div>` : ''}
      </div>
    `).join('') + '</div>';
  }
  document.getElementById('backpackOverlay').style.display = 'block';
}

function closeBackpack() {
  document.getElementById('backpackOverlay').style.display = 'none';
}

function toggleBackpack() {
  if (document.getElementById('backpackOverlay').style.display === 'block') {
    closeBackpack();
  } else {
    showBackpack();
  }
}

function enlargeItem(src, name) {
  const bg = document.createElement('div');
  bg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s';
  bg.innerHTML = `<div style="text-align:center;max-width:85vw"><img src="${escHtml(src)}" style="max-width:85vw;max-height:75vh;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.5)">${name ? `<div style="color:#fff;font-size:15px;margin-top:12px">${escHtml(name)}</div>` : ''}</div>`;
  bg.onclick = () => bg.remove();
  document.body.appendChild(bg);
}

function showClue(text, idx) {
  const container = document.getElementById('clueContainer');
  const btn = document.createElement('button');
  btn.className = 'clue-btn';
  btn.textContent = '💡 查看线索 ' + (idx + 1);
  btn.onclick = () => {
    if (btn.classList.contains('revealed')) return;
    btn.classList.add('revealed');
    btn.innerHTML = '🔍 ' + escHtml(text);
  };
  container.appendChild(btn);
}

function revealAnswer() {
  const el = document.getElementById('puzzleCorrectAnswer');
  if (currentNode && currentNode.puzzle) {
    el.textContent = '正确答案: ' + currentNode.puzzle.correct_answer;
  } else {
    el.textContent = '暂无正确答案';
  }
  el.style.display = 'block';
  document.getElementById('revealBtn').style.display = 'none';
  document.getElementById('nextAfterFailBtn').style.display = 'block';
}

async function proceedAfterFail() {
  const nodeItems = currentNode?.puzzle?.items || [];
  let newItems = [];
  nodeItems.forEach(item => {
    if (item.image && !inventory.find(i => i.image === item.image)) {
      inventory.push({ ...item });
      newItems.push(item);
    }
  });
  if (newItems.length) {
    showToast('🎁 获得 ' + newItems.map(i => i.name).join('、') + '，打开背包查看');
  }
  if (currentNode.next_node_id) {
    const nextNode = await api('/api/nodes/' + currentNode.next_node_id);
    if (nextNode && nextNode.chapter && nextNode.chapter !== currentNode.chapter) {
      await showChapterOverlay(nextNode.chapter);
    }
    loadNode(currentNode.next_node_id);
    return;
  }
  const nextAuto = await getNextAuto();
  if (nextAuto) {
    if (nextAuto.chapter) await showChapterOverlay(nextAuto.chapter);
    loadNode(nextAuto.node_id);
    return;
  }
  const credits = gameConfig.credits;
  if (credits && credits.lines && credits.lines.length > 0) {
    showCredits(credits);
    return;
  }
  showSuccess({ correct: true, message: '已显示正确答案，选择要前往的节点：', next_node_id: null });
}

let starRating = 0;

document.getElementById('starRating')?.addEventListener('click', e => {
  const star = e.target.dataset.star;
  if (!star) return;
  starRating = parseInt(star);
  document.querySelectorAll('#starRating span').forEach((s, i) => {
    s.style.color = i < starRating ? '#ffd700' : '#4a5580';
  });
});

function showCredits(credits) {
  stopMusic();
  if (credits.music) playMusic(credits.music);
  const container = document.getElementById('creditsScroll');
  container.innerHTML = credits.lines.map(line =>
    `<div class="c-line">${escHtml(line)}</div>`
  ).join('');
  document.getElementById('creditsOverlay').style.display = 'block';
  setTimeout(() => {
    document.getElementById('creditsOverlay').style.display = 'none';
    if (credits.music) stopMusic();
    showCommentForm();
  }, 40000);
}

function showCommentForm() {
  starRating = 0;
  document.querySelectorAll('#starRating span').forEach(s => s.style.color = '#4a5580');
  document.getElementById('commentName').value = '';
  document.getElementById('commentContent').value = '';
  document.getElementById('commentStatus').textContent = '';
  document.getElementById('commentOverlay').style.display = 'flex';
}

async function submitComment() {
  const name = document.getElementById('commentName').value.trim();
  const content = document.getElementById('commentContent').value.trim();
  const status = document.getElementById('commentStatus');
  if (!content) { status.textContent = '请输入留言内容'; status.style.color = '#ff4757'; return; }
  status.textContent = '提交中...';
  status.style.color = '#8892b0';
  try {
    await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || '匿名', rating: starRating || null, content })
    });
    status.textContent = '✓ 感谢你的评价！';
    status.style.color = '#64ffda';
    document.getElementById('commentName').value = '';
    document.getElementById('commentContent').value = '';
  } catch (e) {
    status.textContent = '提交失败: ' + e.message;
    status.style.color = '#ff4757';
  }
}

function showToast(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:#ffd700;padding:10px 22px;border-radius:10px;z-index:9999;font-size:14px;border:1px solid rgba(255,215,0,.25);box-shadow:0 4px 16px rgba(0,0,0,.4);animation:fadeIn .2s;pointer-events:none;white-space:nowrap';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 4000);
}

function confirmRestart() {
  if (confirm('确定要重新开始吗？当前进度将丢失。')) {
    localStorage.removeItem('puzzle_current_node');
    localStorage.removeItem('puzzle_inventory');
    inventory = [];
    location.reload();
  }
}

init();
