const app = getApp()

Page({
  data: {
    coverTitle: '✦ 谜 境 探 索 ✦',
    coverSubtitle: '— 验证谜题 —',
    coverBtnText: '开始游戏',
    coverBg: 'linear-gradient(135deg,#0a0e27 0%,#1a1040 50%,#0a0e27 100%)',
    stars: []
  },
  onLoad() {
    this.generateStars()
    this.loadConfig()
    const saved = wx.getStorageSync('puzzle_current_node')
    if (saved) {
      wx.redirectTo({ url: '/pages/play/play' })
    }
  },
  generateStars() {
    const stars = []
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 3,
        size: Math.random() * 2 + 1
      })
    }
    this.setData({ stars })
  },
  loadConfig() {
    wx.request({
      url: app.globalData.serverUrl + '/api/game-config',
      success: res => {
        const cfg = res.data
        const d = {}
        if (cfg.cover_title) d.coverTitle = cfg.cover_title
        if (cfg.cover_subtitle) d.coverSubtitle = cfg.cover_subtitle
        if (cfg.cover_button_text) d.coverBtnText = cfg.cover_button_text
        if (cfg.cover_background) d.coverBg = cfg.cover_background + ' center/cover no-repeat'
        this.setData(d)
      }
    })
  },
  startGame() {
    wx.removeStorageSync('puzzle_current_node')
    wx.removeStorageSync('puzzle_inventory')
    wx.redirectTo({ url: '/pages/play/play' })
  }
})
