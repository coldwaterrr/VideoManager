# VideoManager UI 重构计划（Raycast 风格）

## 目标

在**不改变任何现有功能**的前提下，将 UI 从当前的 Linear 扁平风格全面升级为 Raycast 暗铬渐变风格。所有交互逻辑、IPC 调用、数据库操作、自动更新等完全不变，仅修改视觉样式。

---

## 一、设计原则

### 1.1 Raycast 风格核心特征

| 特征 | 值 |
|------|------|
| **背景** | `#0d0d0f` 深黑 |
| **面板渐变** | `linear-gradient(180deg, #1a1a1c 0%, #141416 100%)` |
| **侧边栏渐变** | `linear-gradient(180deg, #161618 0%, #121214 100%)` |
| **标题栏渐变** | `linear-gradient(180deg, #1c1c1e 0%, #141416 100%)` |
| **边框** | `#2a2a2e` |
| **边框 Hover** | `#3a3a3e` |
| **主色调** | `#6366f1` (indigo) → `#8b5cf6` (violet) 渐变 |
| **主色 Hover** | 渐变增强 + box-shadow 发光 |
| **文字主色** | `#e4e4e7` |
| **文字副色** | `#a1a1aa` |
| **文字弱色** | `#71717a` / `#52525b` |
| **圆角** | 8-12px（保持不变） |
| **过渡动画** | `0.15s ease` |
| **播放器进度条** | 渐变填充 + 底部渐变遮罩 |

### 1.2 与当前 Linear 风格的差异

| 属性 | 当前 Linear | 新 Raycast |
|------|------------|-----------|
| 背景色 | `#09090b` 纯色 | `#0d0d0f` 纯色 |
| 卡片背景 | `#141414` 纯色 | `linear-gradient(180deg, #1a1a1c, #141416)` |
| 侧边栏背景 | `#09090b` 纯色 | `linear-gradient(180deg, #161618, #121214)` |
| 标题栏背景 | `bg-transparent` | `linear-gradient(180deg, #1c1c1e, #141416)` |
| 主色调 | `#8b5cf6` 纯色 | `linear-gradient(135deg, #6366f1, #8b5cf6)` |
| 按钮 | 纯色背景 | 渐变背景 + 发光阴影 |
| 播放器进度条 | 纯色 `violet-500` | 渐变填充 |
| 边框色 | `#27272a` | `#2a2a2e` |

---

## 二、修改文件清单

### 2.1 全局样式文件

#### `src/style.css`

**修改内容：**
- 更新 `:root` CSS 变量，使用 Raycast 风格的颜色值
- 添加渐变相关的 CSS 变量
- 更新 selection 颜色
- 更新全局背景色

**具体变量更新：**
```css
--color-primary: #6366f1;           /* indigo-500 */
--color-primary-hover: #818cf8;     /* indigo-400 */
--color-primary-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
--color-primary-glow: 0 4px 16px rgba(99, 102, 241, 0.4);

--color-bg-base: #0d0d0f;           /* 深黑背景 */
--color-bg-surface: linear-gradient(180deg, #1a1a1c 0%, #141416 100%);  /* 面板渐变 */
--color-bg-sidebar: linear-gradient(180deg, #161618 0%, #121214 100%);  /* 侧边栏渐变 */
--color-bg-titlebar: linear-gradient(180deg, #1c1c1e 0%, #141416 100%); /* 标题栏渐变 */
--color-bg-hover: #1e1e20;

--color-border: #2a2a2e;
--color-border-hover: #3a3a3e;

--color-text-primary: #e4e4e7;
--color-text-secondary: #a1a1aa;
--color-text-muted: #71717a;
--color-text-dim: #52525b;
```

---

### 2.2 标题栏组件

#### `src/components/TitleBar.tsx`

**修改内容：**
- 背景从 `bg-transparent` 改为 Raycast 暗铬渐变
- 按钮 hover 背景从 `hover:bg-zinc-800` 改为 `hover:bg-[#3a3a3e]`
- 关闭按钮 hover 保持红色半透明

**关键 CSS 类替换：**
```tsx
// 标题栏容器
<div className="... bg-gradient-to-b from-[#1c1c1e] to-[#141416] border-b border-[#2a2a2e]">

// 按钮 hover 背景
hover:bg-[#2a2a2e]  →  hover:bg-[#3a3a3e]
```

---

### 2.3 主应用页面

#### `src/App.tsx`

这是修改最多的文件，涉及多个子区域。

**2.3.1 整体布局背景**
- `bg-[#09090b]` → `bg-[#0d0d0f]`

**2.3.2 侧边栏**
- 背景从 `bg-[#09090b]` 改为 `bg-gradient-to-b from-[#161618] to-[#121214]`
- 边框从 `border-zinc-800` 改为 `border-[#2a2a2e]`
- 文件夹按钮（非激活状态）hover 背景从 `hover:bg-white/5` 改为 `hover:bg-[#1e1e20]`
- 激活按钮从 `bg-violet-500` 改为 `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]` + `shadow-[0_4px_12px_rgba(99,102,241,0.25)]`
- 新建文件夹按钮 hover 背景调整

**2.3.3 视频卡片**
- 卡片背景从 `bg-[#141414]` 改为 `bg-gradient-to-b from-[#1a1a1c] to-[#141416]`
- 边框从 `border-zinc-800` 改为 `border-[#2a2a2e]`
- hover 边框从 `hover:border-zinc-700` 改为 `hover:border-[#3a3a3e]`
- hover 效果添加 `hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)]`
- 播放按钮从 `bg-violet-500` 改为 `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]` + 发光阴影
- 评分徽章背景从 `bg-violet-500/20` 改为 `bg-[#6366f1]/15`，文字颜色调整

**2.3.4 工具栏**
- 标题文字渐变效果：`bg-gradient-to-r from-[#e4e4e7] to-[#a1a1aa] bg-clip-text`
- 按钮样式继承 Button 组件的变更

**2.3.5 弹窗系统**
- 所有弹窗背景从 `bg-[#141414]` 改为 `bg-gradient-to-b from-[#1a1a1c] to-[#141416]`
- 边框统一为 `border-[#2a2a2e]`
- 手动刮削弹窗、TMDB 配置弹窗、AI 分类弹窗、播放器选择弹窗、数据库选择弹窗、设置弹窗、删除确认弹窗全部更新

**2.3.6 进度条样式**
- 搜索进度、刮削进度、AI 进度条：进度填充从 `bg-violet-500` 改为 `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]`

---

### 2.4 UI 基础组件

#### `src/components/ui/button.tsx`

**修改内容：**
- `default` variant：从 `bg-violet-500` 改为 `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]`，hover 添加 `shadow-[0_4px_16px_rgba(99,102,241,0.4)]` 和 `hover:-translate-y-0.5`
- `secondary` variant：背景从 `bg-zinc-800` 改为 `bg-[#1e1e20]`，边框从 `border-zinc-700` 改为 `border-[#2a2a2e]`
- `ghost` variant：hover 背景从 `hover:bg-zinc-800` 改为 `hover:bg-[#1e1e20]`

**关键代码变更：**
```tsx
default: 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:shadow-[0_4px_16px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 active:translate-y-0',
secondary: 'bg-[#1e1e20] text-zinc-300 border border-[#2a2a2e] hover:bg-[#2a2a2e] hover:text-white hover:border-[#3a3a3e]',
ghost: 'bg-transparent text-zinc-400 hover:bg-[#1e1e20] hover:text-white',
```

#### `src/components/ui/input.tsx`

**修改内容：**
- 背景从 `bg-zinc-800` 改为 `bg-[#1a1a1c]`
- 边框从 `border-zinc-700` 改为 `border-[#2a2a2e]`
- focus 边框从 `focus-visible:border-violet-500` 改为 `focus-visible:border-[#6366f1]`
- ring 颜色从 `focus-visible:ring-violet-500/20` 改为 `focus-visible:ring-[#6366f1]/20`

---

### 2.5 播放器组件

#### `src/components/VideoPlayer.tsx`

**修改内容：**
- 播放器背景从 `bg-black` 改为 `bg-[#0d0d0f]`
- 顶部按钮背景从 `bg-zinc-800/80` 改为 `bg-[#1a1a1c]/90`
- 顶部边框从 `border-zinc-700` 改为 `border-[#2a2a2e]`
- 播放列表面板背景从 `bg-zinc-900/95` 改为 `bg-[#141416]/95`
- 播放列表边框从 `border-zinc-700` 改为 `border-[#2a2a2e]`
- 当前播放项背景从 `bg-violet-500/20` 改为 `bg-[#6366f1]/15`
- 播放按钮从 `bg-violet-500` 改为 `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]` + 发光
- 进度条滑块使用 `accent-indigo-500`（Tailwind 的 indigo 色）
- 播放控制栏背景改为渐变遮罩 `bg-gradient-to-t from-black/80`

#### `src/components/MpvPlayer.tsx`

**修改内容：**
- 顶部按钮背景从 `bg-zinc-800/80` 改为 `bg-[#1a1a1c]/90`
- 边框从 `border-zinc-700` 改为 `border-[#2a2a2e]`
- 播放列表面板背景和边框同 VideoPlayer
- 设置面板背景从 `bg-[#141416]` 改为 `bg-gradient-to-b from-[#1a1a1c] to-[#141416]`
- 当前播放项背景调整

---

### 2.6 设置相关组件

#### `src/components/SettingItem.tsx`

**修改内容：**
- Toggle 开关从 `bg-violet-500` 改为 `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]`
- 详情面板背景从 `bg-white/5` 改为 `bg-[#1e1e20]`，边框调整

#### `src/components/PlayerSelector.tsx`

**修改内容：**
- 触发按钮背景从 `bg-zinc-800` 改为 `bg-[#1e1e20]`
- 下拉菜单背景从 `bg-zinc-900` 改为 `bg-[#141416]`
- 下拉菜单边框从 `border-zinc-700` 改为 `border-[#2a2a2e]`
- 选中项背景从 `bg-violet-500/20` 改为 `bg-[#6366f1]/15`

---

## 三、实施步骤

### 阶段一：全局 CSS 变量更新
1. 修改 `src/style.css` 中的 `:root` 变量
2. 验证 Tailwind 可以正确引用这些变量

### 阶段二：按钮和输入框更新
1. 修改 `src/components/ui/button.tsx`
2. 修改 `src/components/ui/input.tsx`
3. 验证所有使用 Button/Input 的地方自动生效

### 阶段三：标题栏和布局更新
1. 修改 `src/components/TitleBar.tsx`
2. 修改 `src/App.tsx` 中的整体布局背景

### 阶段四：主应用核心区域
1. 修改侧边栏样式（渐变背景、渐变激活按钮）
2. 修改视频卡片（渐变背景、渐变播放按钮、发光效果）
3. 修改工具栏（文字渐变）
4. 修改所有弹窗（渐变背景）

### 阶段五：播放器组件
1. 修改 `VideoPlayer.tsx` 全部样式
2. 修改 `MpvPlayer.tsx` 全部样式

### 阶段六：设置和选择器
1. 修改 `SettingItem.tsx`
2. 修改 `PlayerSelector.tsx`

### 阶段七：细节打磨
1. 检查所有 hover 过渡动画
2. 检查所有阴影效果
3. 检查文字颜色对比度

### 阶段八：构建验证
1. 执行 `npm run build`
2. 确认无 TypeScript 错误
3. 确认打包成功

---

## 四、功能保护清单（不修改）

以下功能**完全不变**，仅改样式类名：

| 功能 | 保护方式 |
|------|---------|
| 视频扫描 | IPC 调用、进度回调不变 |
| TMDB 刮削 | 自动/手动刮削逻辑不变 |
| 手动刮削 | 搜索、选择、保存逻辑不变 |
| AI 分类 | 流式输出、应用分类逻辑不变 |
| MPV 播放器 | 启动、超分、补帧逻辑不变 |
| Web 播放器 | 播放、暂停、进度、音量控制不变 |
| 虚拟文件夹 | 创建、删除、关联逻辑不变 |
| 数据库管理 | 扫描、选择、切换逻辑不变 |
| 自动更新 | 检查、下载、安装逻辑不变 |
| 系统托盘 | 最小化、恢复逻辑不变 |
| 窗口控制 | 最小化、最大化、关闭不变 |
| 批量操作 | 多选、删除逻辑不变 |
| 播放列表 | 上一首、下一首、选择播放不变 |

---

## 五、风险评估

| 风险 | 等级 | 应对 |
|------|------|------|
| Tailwind 无法识别任意值 | 低 | 使用 `[#hex]` 语法已被支持 |
| 渐变背景在 Electron 中渲染异常 | 低 | demo 已验证正常 |
| 颜色对比度不足 | 中 | 使用 zinc-200/400/500 阶梯确保可读性 |
| 修改遗漏导致样式不一致 | 中 | 全局搜索所有 `violet`、`zinc-800`、`white/[0.0X]` 确保覆盖 |
| 功能意外破坏 | 低 | 只改 className，不碰逻辑代码 |

---

## 六、预计修改行数

| 文件 | 预估行数 |
|------|---------|
| `src/style.css` | ~15 |
| `src/components/ui/button.tsx` | ~3 |
| `src/components/ui/input.tsx` | ~2 |
| `src/components/TitleBar.tsx` | ~5 |
| `src/App.tsx` | ~40-50 |
| `src/components/VideoPlayer.tsx` | ~15 |
| `src/components/MpvPlayer.tsx` | ~10 |
| `src/components/SettingItem.tsx` | ~3 |
| `src/components/PlayerSelector.tsx` | ~5 |
| **总计** | **~100 行** |
