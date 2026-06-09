const app = getApp()
const api = (path, opts = {}) => new Promise((resolve, reject) => {
  console.log('[api]', opts.method || 'GET', app.globalData.serverUrl + path)
  wx.request({
    url: app.globalData.serverUrl + path,
    method: opts.method || 'GET',
    data: opts.body ? JSON.parse(opts.body) : undefined,
    header: { 'Content-Type': 'application/json' },
    success: r => {
      console.log('[api] response', r.statusCode, r.data)
      r.statusCode === 200 ? resolve(r.data) : reject(new Error(typeof r.data === 'string' ? r.data : JSON.stringify(r.data)))
    },
    fail: e => {
      console.error('[api] fail', e)
      reject(e)
    }
  })
})

Page({
  data: {
    // chapter overlay
    showChapterOverlay: false,
    chapterOverlayClass: '',
    chapterTitle: '',
    chapterSubtitle: '',
    // dialogue
    showPuzzle: false,
    speakerLabel: '',
    speakerName: '',
    charArt: '',
    charBg: '',
    dialogueText: '',
    isTyping: false,
    showClickHint: false,
    showGoPuzzle: false,
    showHistoryBtn: false,
    progressDots: [],
    // puzzle
    puzzleQuestion: '',
    puzzleImage: '',
    puzzleInput: '',
    puzzleError: '',
    puzzleAttempts: '',
    submitDisabled: false,
    showAnswerReveal: false,
    answerRevealed: false,
    correctAnswer: '',
    // overlays
    showSuccessOverlay: false,
    historyVisible: false,
    backpackVisible: false,
    enlargeVisible: false,
    enlargeSrc: '',
    enlargeName: '',
    historyList: [],
    backpackItems: [],
    // node selector
    showNodeSelector: false,
    nodeSelectorOptions: [],
    nodeSelectorIndex: 0,
    nodeSelectorLabel: '选择节点',
    // buttons
    showGameBtns: false,
    // page background
    pageBg: '#0a0e27',
    // node options
    nodeOptions: []
  },

  currentNode: null,
  currentDialogueIdx: 0,
  attempts: 0,
  isPaused: false,
  dialogueHistory: [],
  inventory: [],
  typewriterTimer: null,

  onLoad() {
    const saved = wx.getStorageSync('puzzle_inventory')
    if (saved) this.inventory = saved
    const savedNodeId = wx.getStorageSync('puzzle_current_node')
    if (savedNodeId) {
      this.checkChapterOverlay(() => this.loadNode(savedNodeId))
    } else {
      this.loadFirstNode()
    }
  },

  async checkChapterOverlay(cb) {
    try {
      const [nodes, gameCfg] = await Promise.all([api('/api/nodes'), api('/api/game-config')])
      const firstNode = nodes[0]
      if (firstNode && this.currentNode && this.currentNode.chapter && this.currentNode.chapter !== firstNode.chapter) {
        const sub = (gameCfg.chapter_subtitles || {})[this.currentNode.chapter] || ''
        this.setData({
          showChapterOverlay: true,
          chapterOverlayClass: '',
          chapterTitle: this.currentNode.chapter,
          chapterSubtitle: sub
        })
        setTimeout(() => {
          this.setData({ chapterOverlayClass: 'fade-out' })
          setTimeout(() => {
            this.setData({ showChapterOverlay: false, chapterOverlayClass: '' })
            cb()
          }, 500)
        }, 1500)
      } else {
        cb()
      }
    } catch(e) { cb() }
  },

  async loadFirstNode() {
    let nodes
    try {
      nodes = await api('/api/nodes')
    } catch(e) {
      console.error('loadFirstNode error', e)
      wx.showToast({ title: '连接服务器失败', icon: 'none', duration: 5000 })
      return
    }
    this.setData({
      nodeSelectorOptions: nodes,
      nodeSelectorLabel: nodes.length > 0 ? nodes[0].node_name : '选择节点'
    })
    if (!nodes.length) {
      wx.showToast({ title: '没有可用节点', icon: 'none' })
      return
    }
    const first = nodes[0]
    if (!first.chapter) {
      this.loadNode(first.node_id)
      return
    }
    try {
      const gameCfg = await api('/api/game-config')
      const sub = (gameCfg.chapter_subtitles || {})[first.chapter] || ''
      this.setData({
        showChapterOverlay: true,
        chapterOverlayClass: '',
        chapterTitle: first.chapter,
        chapterSubtitle: sub
      })
      setTimeout(() => {
        this.setData({ chapterOverlayClass: 'fade-out' })
        setTimeout(() => {
          this.setData({ showChapterOverlay: false, chapterOverlayClass: '' })
          this.loadNode(first.node_id)
        }, 500)
      }, 1500)
    } catch(e) {
      this.loadNode(first.node_id)
    }
  },

  async loadNode(nodeId) {
    this.currentNode = await api('/api/nodes/' + nodeId)
    wx.setStorageSync('puzzle_current_node', nodeId)
    wx.setStorageSync('puzzle_inventory', this.inventory)
    this.currentDialogueIdx = 0
    this.attempts = 0
    this.isPaused = false
    this.dialogueHistory = []
    this.destroyAllOverlays()
    this.applyBackground(this.currentNode.background)

    // Build progress dots
    const dots = (this.currentNode.dialogues || []).map((_, i) => ({ active: i === 0, done: false }))

    this.setData({
      showPuzzle: false,
      showGameBtns: true,
      showAnswerReveal: false,
      answerRevealed: false,
      correctAnswer: '',
      puzzleInput: '',
      puzzleError: '',
      puzzleAttempts: '',
      submitDisabled: false,
      showHistoryBtn: false,
      showGoPuzzle: false,
      showClickHint: false,
      showSuccessOverlay: false,
      dialogueText: '',
      isTyping: false,
      speakerLabel: '',
      speakerName: '',
      charArt: '',
      charBg: '',
      progressDots: dots,
      historyList: [],
      nodeOptions: []
    })

    this.playDialogues()
  },

  destroyAllOverlays() {
    // overlays are data-driven, just reset flags
  },

  applyBackground(bg) {
    let val = '#0a0e27'
    if (bg) {
      if (typeof bg === 'object') {
        if (bg.type === 'color') val = bg.value || '#0a0e27'
        else if (bg.type === 'image') val = 'url(' + bg.value + ') center/cover fixed'
      } else {
        if (bg.startsWith('#')) val = bg
        else val = bg + ' center/cover no-repeat fixed'
      }
    }
    this.setData({ pageBg: val })
  },

  async playDialogues() {
    const dialogues = this.currentNode.dialogues || []
    if (dialogues.length === 0) {
      this.showPuzzle()
      return
    }
    for (let i = this.currentDialogueIdx; i < dialogues.length; i++) {
      if (this.isPaused) return
      this.currentDialogueIdx = i
      const d = dialogues[i]
      const speaker = d.speaker || ''
      const avatar = d.insert_image || d.speaker_avatar || ''
      let text = d.text || ''
      const prefix = speaker + '：'
      if (text.startsWith(prefix)) text = text.slice(prefix.length)

      // Update progress dots
      const dots = this.data.progressDots.map((dot, idx) => ({
        active: idx === i,
        done: idx < i
      }))

      this.setData({
        speakerLabel: speaker,
        speakerName: speaker,
        charArt: avatar,
        progressDots: dots,
        showClickHint: false,
        isTyping: true,
        dialogueText: ''
      })

      // Typewriter effect
      await this.typeText(text, d.typewriter_speed || 20)

      this.dialogueHistory.push({ text, speaker, avatar })

      if (i < dialogues.length - 1) {
        this.setData({ showClickHint: true })
        await this.waitForClick()
      }
    }

    this.setData({ showClickHint: false, showGoPuzzle: true, showHistoryBtn: true })
  },

  typeText(text, speed) {
    return new Promise(resolve => {
      let idx = 0
      const type = () => {
        if (this.isPaused || idx >= text.length) {
          this.setData({ dialogueText: text, isTyping: false })
          resolve()
          return
        }
        idx++
        this.setData({ dialogueText: text.slice(0, idx) })
        this.typewriterTimer = setTimeout(type, speed)
      }
      type()
    })
  },

  waitForClick() {
    return new Promise(resolve => {
      this._clickResolve = resolve
    })
  },

  onTapScreen() {
    if (this.data.showClickHint && this._clickResolve) {
      this._clickResolve()
      this._clickResolve = null
    }
  },

  showPuzzle() {
    const puzzle = this.currentNode.puzzle || {}
    this.setData({
      showPuzzle: true,
      puzzleQuestion: puzzle.question_text || '',
      puzzleImage: puzzle.question_image || '',
      puzzleError: '',
      puzzleAttempts: '',
      submitDisabled: false,
      showAnswerReveal: true,
      answerRevealed: false,
      correctAnswer: ''
    })
  },

  onInputChange(e) {
    this.setData({ puzzleInput: e.detail.value })
  },

  async submitAnswer() {
    const input = this.data.puzzleInput.trim()
    if (!input) return
    this.setData({ submitDisabled: true, puzzleError: '' })
    this.attempts++
    try {
      const result = await api('/api/nodes/' + this.currentNode.node_id + '/verify', {
        method: 'POST',
        body: JSON.stringify({ answer: input })
      })
      if (result.correct) {
        // Collect items
        const nodeItems = this.currentNode.puzzle?.items || []
        nodeItems.forEach(item => {
          if (item.image && !this.inventory.find(i => i.image === item.image)) {
            this.inventory.push({ ...item })
          }
        })
        wx.setStorageSync('puzzle_inventory', this.inventory)

        this.setData({ showPuzzle: false })
        this.showSuccess(result)
      } else {
        const maxA = this.currentNode.puzzle?.max_attempts || 5
        this.setData({
          puzzleError: result.hint || result.message || '答案不正确',
          puzzleAttempts: '剩余尝试次数: ' + (maxA - this.attempts),
          submitDisabled: false
        })
        if (this.attempts >= maxA) {
          this.setData({ showAnswerReveal: true })
        }
      }
    } catch (e) {
      this.setData({ puzzleError: '验证失败', submitDisabled: false })
    }
  },

  async showSuccess(result) {
    if (result.next_node_id) {
      // Show brief success and go to next
      wx.showToast({ title: '回答正确!', icon: 'success', duration: 800 })
      this.setData({ showPuzzle: false })
      await this.delay(800)
      this.loadNode(result.next_node_id)
    } else {
      // No next node - show node selector
      const allNodes = await api('/api/nodes')
      const others = allNodes.filter(n => n.node_id !== this.currentNode.node_id)
      this.setData({
        showSuccessOverlay: true,
        nodeOptions: others
      })
    }
  },

  goToNode(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ showSuccessOverlay: false })
    this.loadNode(id)
  },

  revealAnswer() {
    if (this.currentNode && this.currentNode.puzzle) {
      this.setData({
        correctAnswer: '正确答案: ' + this.currentNode.puzzle.correct_answer,
        answerRevealed: true
      })
    }
  },

  async proceedAfterFail() {
    const nodeItems = this.currentNode.puzzle?.items || []
    const newItems = []
    nodeItems.forEach(item => {
      if (item.image && !this.inventory.find(i => i.image === item.image)) {
        this.inventory.push({ ...item })
        newItems.push(item)
      }
    })
    wx.setStorageSync('puzzle_inventory', this.inventory)
    if (newItems.length) {
      wx.showToast({ title: '🎁 获得 ' + newItems.map(i => i.name).join('、') + '，打开背包查看', icon: 'none', duration: 4000 })
    }
    if (this.currentNode.next_node_id) {
      this.setData({ showPuzzle: false })
      this.loadNode(this.currentNode.next_node_id)
    } else {
      this.showSuccess({ correct: true, message: '', next_node_id: null })
    }
  },

  showHistory() {
    this.setData({ historyVisible: true })
  },

  closeHistory() {
    this.setData({ historyVisible: false })
  },

  toggleBackpack() {
    if (this.data.backpackVisible) {
      this.closeBackpack()
    } else {
      this.setData({ backpackItems: this.inventory, backpackVisible: true })
    }
  },

  closeBackpack() {
    this.setData({ backpackVisible: false })
  },

  enlargeItem(e) {
    const src = e.currentTarget.dataset.src
    const name = e.currentTarget.dataset.name
    this.setData({ enlargeSrc: src, enlargeName: name || '', enlargeVisible: true })
  },

  closeEnlarge() {
    this.setData({ enlargeVisible: false })
  },

  async onNodeSelect(e) {
    const idx = e.detail.value
    const node = this.data.nodeSelectorOptions[idx]
    if (node) this.loadNode(node.node_id)
  },

  confirmRestart() {
    wx.showModal({
      title: '重新开始',
      content: '确定要重新开始吗？当前进度将丢失。',
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync('puzzle_current_node')
          wx.removeStorageSync('puzzle_inventory')
          wx.removeStorageSync('pageBg')
          this.inventory = []
          wx.redirectTo({ url: '/pages/index/index' })
        }
      }
    })
  },

  delay(ms) { return new Promise(r => setTimeout(r, ms)) }
})
