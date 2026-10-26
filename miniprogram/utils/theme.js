/**
 * 洛克王国 PVP 助手 - 主题系统
 * 默认：童话黄（浅黄温暖，柔和梦幻）
 */

const themes = {
  // 童话黄（主推主题）
  fairytale: {
    name: '童话黄',
    colors: {
      // 背景渐变 - 浅黄系
      bgStart: '#FFFAEB',     // 极浅黄
      bgMiddle: '#FEF8E7',    // 浅黄
      bgEnd: '#FFF9F0',       // 浅黄偏奶油
      
      // 主色 - 温暖金黄
      primary: '#FCD34D',     // 中等金黄
      primaryDark: '#F59E0B', // 深金黄
      secondary: '#FBBF24',   // 浅金黄
      
      // 卡片
      card: '#FFFBF7',        // 温暖米白
      cardBorder: 'rgba(253, 211, 77, 0.2)',
      
      // 文字
      textPrimary: '#92400E',     // 深棕
      textSecondary: '#B45309',   // 中棕
      textMuted: '#D97706',       // 浅棕
      
      // 强调色
      accent: '#FECACA',          // 浅粉红
      success: '#BEF264',         // 柔和绿
      info: '#7DD3FC',            // 柔和蓝
    },
    shadows: {
      soft: '0 2rpx 8rpx rgba(253, 211, 77, 0.12)',
      card: '0 4rpx 16rpx rgba(253, 211, 77, 0.15)',
      button: '0 8rpx 24rpx rgba(252, 211, 77, 0.4)',
    },
    radius: {
      sm: '16rpx',
      md: '24rpx',
      lg: '32rpx',
    },
  },

  // 奶油白（备选 1）
  cream: {
    name: '奶油白',
    colors: {
      bgStart: '#FEFCE8',
      bgMiddle: '#FFFBF0',
      bgEnd: '#FEF3E2',
      
      primary: '#F59E0B',
      primaryDark: '#D97706',
      secondary: '#FBBF24',
      
      card: '#FFFEF9',
      cardBorder: 'rgba(245, 158, 11, 0.15)',
      
      textPrimary: '#78350F',
      textSecondary: '#A16207',
      textMuted: '#CA8A04',
      
      accent: '#FCA5A5',
      success: '#D1FAE5',
      info: '#BAE6FD',
    },
    shadows: {
      soft: '0 2rpx 8rpx rgba(245, 158, 11, 0.1)',
      card: '0 4rpx 16rpx rgba(245, 158, 11, 0.12)',
      button: '0 8rpx 24rpx rgba(245, 158, 11, 0.35)',
    },
    radius: {
      sm: '20rpx',
      md: '28rpx',
      lg: '36rpx',
    },
  },

  // 蜜糖金（备选 2）
  honey: {
    name: '蜜糖金',
    colors: {
      bgStart: '#FFF7ED',
      bgMiddle: '#FEF3E2',
      bgEnd: '#FFFBF0',
      
      primary: '#FB923C',
      primaryDark: '#EA580C',
      secondary: '#FDBA74',
      
      card: '#FFFBF7',
      cardBorder: 'rgba(251, 146, 60, 0.2)',
      
      textPrimary: '#7C2D12',
      textSecondary: '#92400E',
      textMuted: '#B45309',
      
      accent: '#FBCFE8',
      success: '#DCFCE7',
      info: '#CFFAFE',
    },
    shadows: {
      soft: '0 2rpx 8rpx rgba(251, 146, 60, 0.12)',
      card: '0 4rpx 16rpx rgba(251, 146, 60, 0.15)',
      button: '0 8rpx 24rpx rgba(251, 146, 60, 0.4)',
    },
    radius: {
      sm: '18rpx',
      md: '26rpx',
      lg: '34rpx',
    },
  },

  // 浅柔白（备选 3）
  soft: {
    name: '浅柔白',
    colors: {
      bgStart: '#FEF8F0',
      bgMiddle: '#FFFBF7',
      bgEnd: '#FEF5E7',
      
      primary: '#FBBF24',
      primaryDark: '#F59E0B',
      secondary: '#FCD34D',
      
      card: '#FFFEFB',
      cardBorder: 'rgba(251, 191, 36, 0.18)',
      
      textPrimary: '#713F12',
      textSecondary: '#92400E',
      textMuted: '#B45309',
      
      accent: '#F8D5DA',
      success: '#D7F9D1',
      info: '#D1E7F0',
    },
    shadows: {
      soft: '0 2rpx 8rpx rgba(251, 191, 36, 0.1)',
      card: '0 4rpx 16rpx rgba(251, 191, 36, 0.12)',
      button: '0 8rpx 24rpx rgba(251, 191, 36, 0.35)',
    },
    radius: {
      sm: '16rpx',
      md: '24rpx',
      lg: '32rpx',
    },
  },
};

class ThemeManager {
  constructor() {
    this.currentTheme = 'fairytale';
    this.themes = themes;
  }

  getTheme() {
    return this.themes[this.currentTheme];
  }

  setTheme(themeName) {
    if (this.themes[themeName]) {
      this.currentTheme = themeName;
      wx.setStorageSync('theme', themeName);
      console.log(`主题已切换为: ${this.themes[themeName].name}`);
      return true;
    }
    return false;
  }

  loadTheme() {
    const saved = wx.getStorageSync('theme');
    if (saved && this.themes[saved]) {
      this.currentTheme = saved;
      console.log(`已加载保存的主题: ${this.themes[saved].name}`);
    } else {
      console.log(`使用默认主题: ${this.themes[this.currentTheme].name}`);
    }
  }

  applyTheme(page) {
    const theme = this.getTheme();
    page.setData({ theme });
  }

  getAllThemes() {
    return Object.keys(this.themes).map(key => ({
      key,
      name: this.themes[key].name,
      active: key === this.currentTheme,
    }));
  }

  getCurrentThemeName() {
    return this.themes[this.currentTheme].name;
  }
}

const themeManager = new ThemeManager();
module.exports = themeManager;
