# 🚲 Neumorphism 自行车商城模块

在 ShiGuRock 项目中实现的 Neumorphism 风格电商应用示例。

## 📍 位置

- 路由：`/shop`
- 模块：`apps/web/src/modules/shop/`
- 样式系统：`shop-theme.css`

## 🎨 设计特点

### 色彩系统
```css
--shop-bg: #1a1f3a              /* 深紫蓝背景 */
--shop-card: #252d47            /* 卡片背景 */
--shop-primary: #3b82f6         /* 主色（蓝） */
--shop-primary-light: #60a5fa   /* 浅蓝高亮 */
--shop-accent: #0ea5e9          /* 强调色 */
```

### Neumorphism 效果
- **柔和阴影**：`neomorph-raised` - 凸起效果
- **内阴影**：`neomorph-pressed` - 按下效果
- **毛玻璃**：`frosted-glass` - 半透明背景 + 模糊
- **渐变分割**：`gradient-divider` - 蓝色渐变区域

## 📱 页面流程

### 1️⃣ 首页 (Home)
- **导航栏**：标题 + 搜索按钮
- **促销横幅**：大图 + 折扣信息
- **分类过滤**：滑动标签选择
- **产品网格**：2列网格布局
- **底部导航**：5个功能菜单

### 2️⃣ 产品详情 (Detail)
- **返回按钮**：导航回首页
- **大图展示**：产品 + 渐变背景
- **标签栏**：描述 / 规格切换
- **产品信息**：品牌、描述、价格
- **操作按钮**：收藏、加入购物车

### 3️⃣ 购物车 (Cart)
- **购物车列表**：产品卡片 + 数量调整
- **优惠码输入**：支持促销码
- **总价计算**：实时更新
- **结算按钮**：进入支付流程

## 🛠️ 核心组件

### `BikeCard`
产品卡片组件，包含：
- 产品图片（emoji 示例）
- 品牌 + 名称
- 价格 + 折扣
- 收藏按钮

### `NeomorphButton`
Neumorphism 风格按钮：
- 两种变体：`primary` / `secondary`
- 完全圆角 + 阴影
- 悬停动画

### `CategoryFilter`
分类过滤器：
- 滑动选择
- 活动状态高亮
- 柔和阴影

### `QuantityControl`
数量调整器：
- ± 按钮
- 实时更新
- 最小值限制 (1)

### `PriceTag`
价格标签：
- 优惠价格高亮
- 原价删除线
- 自动计算

## 📊 状态管理

```typescript
// 当前页面
currentPage: 'home' | 'detail' | 'cart'

// 产品收藏
favorites: Set<string>

// 购物车
cartItems: Map<string, number>  // productId -> quantity

// 已选产品
selectedProduct: BikeProduct | null
```

## 🎬 交互流程

```
首页
  ↓ (点击产品)
详情页 → 收藏 / 加入购物车
  ↓ (返回)
首页
  ↓ (点击购物车)
购物车页 → 数量调整 / 输入优惠码 / 结算
  ↓ (返回)
首页
```

## 💻 开发命令

```bash
# 启动开发服务器
pnpm dev

# 访问页面
http://127.0.0.1:26900/shop

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint
```

## 🔧 样式层次

### 1. 主题变量（CSS Custom Properties）
```css
.shop-dark {
  --shop-bg: #1a1f3a;
  --shop-primary: #3b82f6;
  /* ... 更多变量 */
}
```

### 2. Neumorphism 工具类
```css
.neomorph-raised        /* 凸起阴影 */
.neomorph-pressed       /* 内阴影 */
.neomorph-soft          /* 柔和效果 */
.frosted-glass          /* 毛玻璃 */
.gradient-divider       /* 渐变分割 */
```

### 3. 过渡动画
```css
.shop-transition        /* 平滑过渡 */
```

## 📦 文件结构

```
modules/shop/
├── shop-theme.css       /* Neumorphism 主题系统 */
├── components.tsx       /* 可复用组件 */
├── shop-view.tsx        /* 主视图（3个页面） */
└── README.md           /* 本文件 */

app/shop/
└── page.tsx            /* 路由入口 */
```

## 🎯 特色实现

✨ **响应式设计**
- 移动端优先
- Tailwind 响应式类
- `safe-area-inset` 支持（iPhone 刘海）

🌙 **深色模式优化**
- 高对比度文字
- 柔和阴影不刺眼
- 蓝色渐变视觉舒适

🔄 **平滑动画**
- 悬停效果
- 页面过渡
- 按钮反馈

📱 **移动端最优**
- 完整手机屏幕适配
- 安全区支持
- 触摸友好的按钮大小

## 🚀 下一步扩展

- [ ] 集成真实产品数据库
- [ ] 完整支付流程
- [ ] 用户账户系统
- [ ] 产品搜索/过滤
- [ ] 订单历史
- [ ] 实际产品图片
- [ ] 评价系统
- [ ] 推荐算法

## 📝 笔记

这个实现完全是前端示例，使用：
- **React 19** 组件和 hooks
- **Tailwind CSS v4** 工具类
- **纯 CSS** Neumorphism 效果
- **TypeScript** 类型安全
- **Lucide React** 图标库

所有数据当前是 mock，可以轻松连接后端 API。
