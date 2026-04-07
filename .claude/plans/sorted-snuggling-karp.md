# mpv 播放器综合优化方案

## Context

用户反馈三个问题：
1. mpv OSC（屏幕控制器）界面有英文标签，希望中文
2. 设置中"Anime4K 超分"、"补帧"等功能太专业、不懂含义，需要适当引导
3. 想让用户在三种播放方式间切换（系统默认 / mpv / 内置 Web）

---

## 第一步：添加播放器选择功能

### 全局配置
新增 `electron/player-config.ts`：
```typescript
// 读取/保存 JSON 配置: mpv-config.json 同目录下
{ "defaultPlayer": "mpv" } // "mpv" | "system" | "web"
```

### 主进程 (`electron/main.ts`)
新增 IPC 处理器：
- `player:get-config` → 返回当前配置
- `player:save-config` → 保存配置

### preload (`electron/preload.cjs`)
新增 bridge 方法：`playerGetConfig`, `playerSaveConfig`

### 类型声明 (`electron/electron-env.d.ts`, `src/global.d.ts`)
添加 player 相关方法声明

### 主界面 (`src/App.tsx`)
- 在工具栏右上角添加播放器切换按钮（⚙设置按钮旁边）
- 下拉菜单：系统默认 / mpv 播放器 / Web 播放器
- 修改 `playingVideo` 渲染逻辑，**根据选择渲染不同播放器组件**

当前 App.tsx L2350-2370 只有 `<MpvPlayer>`，改为：
```tsx
{playingVideo && defaultPlayer === 'mpv' && (
  <MpvPlayer ...props... />
)}
{playingVideo && defaultPlayer === 'web' && (
  <VideoPlayer ...props... />
)}
```

### 系统默认播放器
- 点击视频卡片→检测配置→如果是 `system` → 执行 `shell.openPath(filePath)`
- 不进入播放状态（独立于应用运行）

---

## 第二步：mpv 设置面板引导优化

### 修改 `src/components/MpvPlayer.tsx`（设置面板部分）

当前设置面板只有"开启/关闭"没有说明。改为**带 Tooltip 的结构**：

```
┌── 播放器设置 ─────────────────────────────┐
│                                           │
│ [?] Anime4K 超分              [关闭/开启] │
│     针对动漫/动画画面的 AI 超分辨率增强    │
│     锐化线条、填充细节，不适合真人影视     │
│                                           │
│ [?] 补帧 (插帧)              [关闭/开启]  │
│     将低帧率视频插值到高帧率显示          │
│     动画更流畅，真人可能导致"肥皂效应"    │
│                                           │
│ [?] 超分 Shader                           │
│  [Anime4K] [FSRCNNX] [  无  ]            │
│  Anime4K: 适合动漫，增强锐度和色彩        │
│  FSRCNNX: 通用超分，适合写实/真人画面     │
│                                           │
│ 修改设置后需重新打开视频                   │
└────────────────────────────────────────────┘
```

### 交互设计
- 默认显示：功能名 + 简短描述（一行）
- 点击 `[?]` 或鼠标悬停：展开详细说明
- 避免冗余：说明只在"首次点击/悬停"时展开，不永久显示

**新增 `src/components/SettingItem.tsx` 可复用组件**：
```tsx
<SettingItem
  name="Anime4K 超分"
  shortDesc="针对动漫/动画的 AI 超分辨率增强"
  detail="锐化线条、填细节，在动漫画面中效果显著。真人影视不建议使用，可能导致画面失真。"
  enabled={...}
  onToggle={...}
/>
```

---

## 第三步：mpv OSC 汉化文件

### 新增文件 `mpv/mpv/scripts/osc-locale.lua`

mpv 的 OSC 是内置编译的 Lua 脚本。可以通过放置一个 `scripts/` 目录下的 Lua 脚本来注册自定义 locale。

mpv 从 v0.38 起支持 `script-opts` 的 `osc-language` 选项。如果版本支持，在 `mpv.conf` 中可以设置：
```
script-opts=osc-language=zh
```

如果当前版本不支持，则创建一个小型 Lua locale 补丁：
```lua
-- osc-locale.lua: 注册中文 locale 到 mpv 的 osc 系统
local mp = require "mp"
mp.set_property("user-data/osc/strings/title/no-file", "无文件")
-- ... 其他字符串
```

### 新增文件 `mpv/mpv/input.conf`
定义键盘快捷键（可选，用于自定义快捷键行为）

### 新增文件 `mpv/mpv/mpv.conf`
```ini
# mpv 基础配置
osc=yes
osd-level=1
hwdec=auto
```

### electron-builder.json5
确认 `extraFiles: ["mpv/**"]` 已包含这些新增文件（已有，无需变动）。

---

## 文件修改清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `electron/player-config.ts` | **新建** | 播放器配置文件 |
| `mpv/mpv/scripts/osc-locale.lua` | **新建** | OSC 中文本地化 |
| `mpv/mpv/mpv.conf` | **新建** | mpv 基础配置 |
| `mpv/mpv/input.conf` | **新建** | 快捷键配置 |
| `src/components/SettingItem.tsx` | **新建** | 可复用设置项组件（带说明） |
| `src/components/PlayerSelector.tsx` | **新建** | 工具栏播放器选择器 |
| `src/App.tsx` | **修改** | 集成播放器选择、条件渲染 |
| `electron/main.ts` | **修改** | 新增 player IPC 处理器 |
| `electron/preload.cjs` | **修改** | 新增 player bridge |
| `electron/electron-env.d.ts` | **修改** | 类型声明 |
| `src/global.d.ts` | **修改** | 类型声明 |
| `src/components/MpvPlayer.tsx` | **修改** | 设置面板 + SettingItem 集成 |

---

## 验证方案

1. **开发模式**: `npx vite build && npx electron .`
2. 测试三种播放器切换
3. 测试 mpv 设置面板的引导提示
4. 确认 mpv 启动时加载了中文 locale
5. **打包**: `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win --x64`
6. 确认 `mpv/mpv/` 下所有新增文件存在于 `build-release/0.2.0/win-unpacked/mpv/mpv/`