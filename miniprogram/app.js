// app.js
App({
  globalData: {
    apiBase: 'https://api.shigu.zone',
    userInfo: null,
    catalog: null,
  },

  onLaunch() {
    console.log('洛克 PVP 助手启动');
    this.checkUpdate();
    this.loadCatalog();
  },

  // 检查小程序更新
  checkUpdate() {
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: '更新提示',
        content: '新版本已准备好，是否重启应用？',
        success: (res) => {
          if (res.confirm) {
            updateManager.applyUpdate();
          }
        },
      });
    });
  },

  // 加载图鉴数据
  async loadCatalog() {
    try {
      // 优先从本地缓存读取
      const cached = wx.getStorageSync('catalog');
      if (cached) {
        this.globalData.catalog = cached;
        console.log('图鉴数据已从缓存加载');
      }

      // 后台更新
      const res = await this.request('/api/catalog');
      if (res.version !== cached?.version) {
        this.globalData.catalog = res;
        wx.setStorageSync('catalog', res);
        console.log('图鉴数据已更新:', res.version);
      }
    } catch (err) {
      console.error('加载图鉴失败:', err);
    }
  },

  // 封装网络请求
  request(url, options = {}) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: this.globalData.apiBase + url,
        method: options.method || 'GET',
        data: options.data,
        header: {
          'Content-Type': 'application/json',
          ...options.header,
        },
        success: (res) => {
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        },
        fail: reject,
      });
    });
  },
});
