// pages/index/index.js
const app = getApp();
const themeManager = require('../../utils/theme.js');

Page({
  data: {
    loading: false,
    theme: null,
    themeList: [],
  },

  onLoad() {
    // 加载主题
    themeManager.loadTheme();
    themeManager.applyTheme(this);
    
    // 获取主题列表
    this.setData({
      themeList: themeManager.getAllThemes(),
    });
  },

  // 切换主题
  switchTheme(e) {
    const { theme: themeName } = e.currentTarget.dataset;
    themeManager.setTheme(themeName);
    themeManager.applyTheme(this);
    
    // 更新主题列表
    this.setData({
      themeList: themeManager.getAllThemes(),
    });

    wx.showToast({
      title: '主题已切换',
      icon: 'success',
      duration: 1500,
    });
  },

  // 拍照上传
  async handlePhotoUpload() {
    try {
      this.setData({ loading: true });

      // 1. 选择图片
      const res = await this.chooseImage();
      
      // 2. 压缩图片
      const compressed = await this.compressImage(res.tempFilePaths[0]);

      // 3. 调用识别 API
      const result = await this.ingestPhoto(compressed);

      // 4. 跳转到对战页
      wx.navigateTo({
        url: `/pages/battle/battle?data=${encodeURIComponent(JSON.stringify(result))}`,
      });

    } catch (err) {
      console.error('识别失败:', err);
      wx.showToast({
        title: err.message || '识别失败',
        icon: 'none',
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 选择图片
  chooseImage() {
    return new Promise((resolve, reject) => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: resolve,
        fail: reject,
      });
    });
  },

  // 压缩图片（简化版，实际需要 canvas）
  async compressImage(path) {
    // TODO: 实现真实的图片压缩
    return path;
  },

  // 调用识别 API
  async ingestPhoto(image) {
    const res = await app.request('/api/ingest/photo', {
      method: 'POST',
      data: { image, compressed: true },
    });

    if (!res.success) {
      throw new Error(res.error || '识别失败');
    }

    return res;
  },

  // 手动输入
  goToManual() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none',
    });
  },

  // 历史对局
  goToHistory() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none',
    });
  },
});
