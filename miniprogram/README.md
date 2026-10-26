# 🏰 洛克王国 PVP 助手 · 小程序完整版

## 项目概况

**产品名称**：洛克王国 PVP 助手  
**版本**：0.1.0（小程序首发）  
**定位**：对战实时决策辅助工具  
**核心功能**：拍照识别阵容 → 秒级推荐最优行动  
**设计风格**：🌟 **童话黄**（浅黄温暖，柔和梦幻）

---

## 🎨 视觉设计

### 童话黄主题（当前选中）

**色彩系统：**
```
背景渐变：#FFFAEB → #FEF8E7 → #FFF9F0（浅黄→米白→奶油）
主色调：  #FCD34D（温暖金黄）
深色：    #F59E0B（深金黄）
卡片：    #FFFBF7（温暖米白）
文字：    #92400E（深棕）
```

**设计特点：**
- ✨ 浅黄色为主，温暖柔和
- 🏰 城堡浮动动画，增加童话感
- 📱 简洁 emoji 装饰，不过度
- 🎭 全圆角卡片（24-32rpx）
- 💫 柔和阴影，梦幻气质

**备选主题：**
- 🥛 奶油白（温暖奶油色）
- 🍯 蜜糖金（甜蜜橙黄）
- ☁️ 浅柔白（梦幻柔和）

---

## 📱 项目结构

```
miniprogram/
├── app.json              # 全局配置
├── app.js                # 应用逻辑
├── app.wxss              # 全局样式
├── project.config.json   # 微信配置
├── sitemap.json          # 搜索索引
│
├── pages/
│   ├── index/            ✅ 首页（已完成）
│   │   ├── index.wxml    # 模板
│   │   ├── index.js      # 逻辑
│   │   ├── index.wxss    # 样式
│   │   └── index.json    # 配置
│   │
│   ├── battle/           🚧 对战页（开发中）
│   │   ├── battle.wxml
│   │   ├── battle.js
│   │   ├── battle.wxss
│   │   └── battle.json
│   │
│   └── profile/          🚧 我的页（开发中）
│       └── ...
│
├── utils/
│   └── theme.js          # 🎨 主题系统（关键）
│
└── images/              # 图片资源（tabBar 图标等）
```

---

## 🌟 核心功能

### 首页（已完成）✅

**页面布局：**
1. **顶部** - 城堡 Logo + 标题 + 标语
2. **主按钮** - 拍照识别（突出主操作）
3. **分割线** - 装饰文案
4. **次要入口** - 手动输入 / 历史对局
5. **特性说明** - 秒级推荐 / 完全安全 / 离线运行
6. **主题切换** - 4 个主题可选（首页底部）

**交互：**
- 点击「拍照识别」→ 调用相机/相册
- 上传后 2-3 秒识别 → 跳转对战页
- 点击主题 chip → 实时切换风格 + 自动保存

### 对战页（开发中）🚧

预计功能：
- 实时推荐卡片（金银铜排名）
- 胜率走势图
- 我方/对方精灵信息
- 上/下回合导航

### 我的页（开发中）🚧

预计功能：
- 精灵仓库
- 历史对局统计
- 主题设置入口

---

## 🚀 快速开始

### 步骤 1：下载工具
```
https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html
```

### 步骤 2：打开项目
1. 启动微信开发者工具
2. 点击「导入」
3. 选择目录：`D:\ShiGuRock\miniprogram`
4. AppID 选择：「测试号」（touristappid）

### 步骤 3：查看效果
- 模拟器自动显示首页
- 默认使用「童话黄」主题
- 点击底部主题卡片可切换风格

### 步骤 4：真机预览（可选）
1. 点击工具栏「预览」
2. 手机微信扫二维码
3. 实机查看效果

---

## 🎯 主题系统

### 四种主题对比

| 主题 | 背景 | 主色 | 特点 | 适合 |
|------|------|------|------|------|
| **🌟 童话黄** | 浅黄→米白 | #FCD34D | 温暖梦幻 | **推荐** |
| **🥛 奶油白** | 极浅黄→温白 | #F59E0B | 高级质感 | 追求温暖 |
| **🍯 蜜糖金** | 浅橙→米白 | #FB923C | 甜蜜可爱 | 喜欢活泼 |
| **☁️ 浅柔白** | 米白→浅紫 | #FBBF24 | 梦幻柔和 | 追求梦幻 |

### 使用方式

**WXML 模板中动态应用主题：**
```xml
<view style="background: {{theme.colors.card}}; color: {{theme.colors.textPrimary}};">
  内容在这里
</view>
```

**JS 中切换主题：**
```js
const themeManager = require('../../utils/theme.js');

switchTheme(e) {
  const themeName = e.currentTarget.dataset.theme;
  themeManager.setTheme(themeName);
  themeManager.applyTheme(this);
  
  wx.showToast({
    title: `已切换到 ${themeManager.getCurrentThemeName()}`,
    icon: 'success',
  });
}
```

### 主题持久化

- 用户选择的主题自动保存到 `wx.storage`
- 下次打开小程序自动加载上次的主题
- 代码中自动处理，无需额外配置

---

## 📝 代码示例

### 响应式布局

```wxml
<!-- 使用 rpx 单位（响应式像素） -->
<!-- 设计稿 750px 宽，直接用 rpx 数值 -->
<view style="width: 750rpx; padding: 48rpx;">
  <!-- 在 iPhone 12（390pt）上：750rpx ÷ 390 ≈ 1.92 倍，自动缩放 -->
</view>
```

### 渐变背景

```wxml
<view style="background: linear-gradient(180deg, {{theme.colors.bgStart}}, {{theme.colors.bgMiddle}}, {{theme.colors.bgEnd}});">
  整页渐变背景
</view>
```

### 动画效果

```wxss
.castle {
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8rpx); }
}
```

---

## 🔧 后端对接

当前首页是演示版本，实际功能需对接：

### 接口列表

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/ingest/photo` | POST | 拍照识别阵容 |
| `/api/battle/recommend` | POST | 获得推荐行动 |
| `/api/catalog` | GET | 获取图鉴数据 |

### 示例请求（photo）

```js
wx.request({
  url: 'https://api.shigu.zone/api/ingest/photo',
  method: 'POST',
  data: {
    image: 'data:image/jpeg;base64,...',
    compressed: true,
  },
  success: (res) => {
    // res.data: { player: [...], enemy: [...], success: true }
    wx.navigateTo({
      url: `/pages/battle/battle?data=${encodeURIComponent(JSON.stringify(res.data))}`,
    });
  },
});
```

---

## 📊 性能指标

**目标指标：**
- 首屏加载：< 1s
- 页面切换：< 200ms
- 主题切换：实时（< 100ms）
- 包体积：< 500KB

**当前状态：**
- 首页代码：~15KB
- 样式：~8KB
- 资源：无图片（全 emoji）
- **总计：~23KB**（不含后端数据）

---

## ✅ 检查清单

### 开发检查
- [x] UI 设计完成（童话黄主题）
- [x] 页面结构完成
- [x] 主题系统实现
- [x] 响应式适配
- [x] 安全区域处理
- [ ] 后端接口对接
- [ ] 图片识别功能
- [ ] 推演推荐功能

### 测试检查
- [ ] iOS Safari 测试
- [ ] Android Chrome 测试
- [ ] 长屏 / 短屏适配
- [ ] 暗色模式（可选）
- [ ] 性能测试

### 发布检查
- [ ] 隐私政策
- [ ] 用户协议
- [ ] 功能截图（3 张）
- [ ] 服务类目选择
- [ ] 合规声明

---

## 🎓 学习资源

### 小程序开发文档
- 官方文档：https://developers.weixin.qq.com/miniprogram/dev/framework/
- WXML 语法：https://developers.weixin.qq.com/miniprogram/dev/reference/wxml/
- WXSS 样式：https://developers.weixin.qq.com/miniprogram/dev/reference/wxss/

### 关键概念
- **rpx**：响应式像素，`750rpx = 屏幕宽度`
- **Page()**：页面类，管理生命周期和数据
- **setData()**：更新数据（触发视图重渲染）
- **wx API**：微信原生能力（相机、存储等）

---

## 💬 常见问题

### Q: 为什么用 4 个主题而不是只有 1 个？
**A:** 不同用户审美差异大。提供选项让用户自己选，提升满意度。

### Q: 童话黄会不会显示不出来？
**A:** 不会。所有主题都是标准 RGB 颜色值，在所有设备上显示一致。

### Q: 怎样添加新主题？
**A:** 在 `utils/theme.js` 中的 `themes` 对象里加一个新的主题配置即可。

### Q: 主题切换会丢失用户数据吗？
**A:** 不会。主题只是视觉样式，与功能无关，数据存储在其他地方。

### Q: 能在测试版上线吗？
**A:** 可以。微信开发者工具中的预览就是测试版。真正上线需提交审核。

---

## 📞 技术支持

遇到问题可以查看：
1. 微信开发者工具的控制台（Ctrl+I）
2. 本项目的设计文档（`docs/` 目录）
3. 微信官方文档

---

## 🎉 总结

✨ **童话黄主题** 已完全设计并实现  
📱 **首页功能** 已可用  
🎨 **主题系统** 可随时切换  
🚀 **准备就绪** 可对接后端  

下一步：
1. 确认风格满意度
2. 对接图片识别 API
3. 实现推演推荐功能
4. 完善对战页 UI
5. 提交微信审核

现在用微信开发者工具打开看看，应该很满意了！🏰✨
