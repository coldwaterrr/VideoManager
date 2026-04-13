# VideoManager 功能文档

> 最后更新：2026-04-08

---

## 项目概述

VideoManager（VideoSorter）是一个基于 Electron + React + TypeScript 的本地视频管理工具。使用 sql.js（WASM SQLite）作为数据库。

**技术栈：** Electron · React · TypeScript · Tailwind CSS · Vite · sql.js · TMDB API

---

## 核心功能

### 1. 视频扫描与导入

- 支持 `.mp4`、`.mkv`、`.avi`、`.mov`、`.wmv` 格式
- 递归扫描目录，最大 3 层深度
- 并发读取（MAX_CONCURRENT=50），防止 EMFILE 错误
- 内置 ffprobe 支持读取视频时长
- 扫描筛选器：按文件大小和格式过滤
- 忽略系统目录（$RECYCLE.BIN、Windows 等）以提升速度

### 2. 虚拟文件夹管理

- 创建自定义虚拟文件夹（收藏夹、待整理等）
- 视频可分配到多个虚拟文件夹
- 支持文件夹切换（toggleVideoFolder）

### 3. 智能搜索与标签

- 全局关键词搜索（文件名和路径）
- 自动标签提取（文件名 + 路径 + 文件夹名）
- 按标签筛选（下拉选择框）
- 多条件排序：时间 / 名称 / 大小，支持升序 / 降序

### 4. 视频列表与预览

- 分页显示（每页 12 个视频）
- 悬停 500ms 后触发视频片段轮播预览（5 个随机时间点，间隔 2-3 秒随机切换）
- 悬停时循环播放 5 个随机预览片段
- 静态封面：从随机位置截取（10%-50% 时间点）

### 5. 批量操作

- 全选 / 取消全选
- 批量删除视频记录（支持搜索过滤确认）
- 清理旧格式记录（删除不认识的 .webm 等格式视频）
- 双击打开视频（系统默认播放器）

### 6. 本地视频播放

- 内置播放器，支持自定义样式和全屏
- 快捷键：左/右方向键切换上一个/下一个视频
- 播放列表面板显示
- Ctrl+方向键调节进度
- 进度条可拖动、播放/暂停
- 键盘 Esc 退出播放器

### 7. 无边框窗口

- 无边框设计，隐藏标题栏
- 自定义最小化、最大化、关闭按钮
- 最小化时自动隐藏到系统托盘
- 系统托盘恢复窗口

---

## 新增功能

### 8. TMDB 刮削

**文件：** `electron/tmdb.ts`

- TMDB API 封装
- 文件名智能解析（去除扩展名、技术标签、提取标题和年份）
- 搜索策略：先搜索电影 → 搜索电视剧 → 选择评分更高、投票更多的结果
- 存储数据：tmdb_id、media_type、title、original_title、overview、poster_path、backdrop_path、release_date、vote_average、vote_count、genre_ids、cast_names、scraped_at
- 要求投票数 ≥ 5 才认为是有效结果

**使用方式：**
1. 点击工具栏齿轮图标，输入 TMDB API Key
2. 点击「刮削全部」开始批量刮削
3. 刮削后视频卡片显示海报 + 标题 + 评分 + 年份

### 9. 选择数据库

**位置：** 侧边栏底部

- 扫描项目中所有 SQLite 文件（项目根目录、userData、release 目录）
- 按文件大小降序显示（大的可能是完整数据）
- 一键切换数据库
- 切换后自动刷新整个应用状态

### 10. 数据库路径修复

- 数据库路径固定为项目根目录下的 `.videosorter/videosorter.sqlite`
- 避免开发模式和打包后因 `userData` 不同导致的数据库漂移问题

### 11. MPV 播放器增强（v0.2.1）

**文件：** `electron/mpv.ts`, `src/components/MpvPlayer.tsx`

#### 超分辨率支持

**Shader 目录：** `mpv/shaders/`

- **Anime4K**（动漫优化）
  - Anime4K_Clamp_Highlights.glsl
  - Anime4K_Restore_Soft_M.glsl
  - Anime4K_Upscale_M.glsl
- **FSRCNNX**（通用超分）
  - fsrcnnx/FSRCNNX_x2_16-0-4-1.glsl
  - fsrcnnx/FSRCNNX_x3_16-0-4-1.glsl
  - fsrcnnx/FSRCNNX_x4_16-0-4-1.glsl

**配置：** `.videosorter/mpv-config.json`
```json
{
  "anime4k": false,
  "superResShader": "none",  // "anime4k" | "fsrcnnx" | "none"
  "interpolation": false,
  "interpolationFps": 60,
  "mpvPath": "项目根目录/mpv/"
}
```

**参数生成：** `buildShaderArgs()` 根据配置添加 `--glsl-shader` 参数

#### 补帧插值

启用时添加参数：
```
--interpolation
--video-sync=display-resample
--tscale=oversample
```

#### 播放器选择

三个播放后端：
1. **system** - 系统默认播放器
2. **mpv** - 增强 MPV（独立窗口 + shader 支持）
3. **web** - 内置 Web 播放器

---

## 快捷键（MPV 模式）

| 快捷键 | 功能 |
|--------|------|
| `Esc` | 关闭 MPV 窗口 |
| `←` `→` | 上一个 / 下一个视频 |
| `Space` | 播放 / 暂停 |
| `Ctrl+←` | 后退 5 秒 |
| `Ctrl+→` | 前进 5 秒 |

---

## 数据库 Schema

### videos 表
- `id` INTEGER PRIMARY KEY
- `absolute_path` TEXT UNIQUE
- `file_name` TEXT
- `file_size` INTEGER DEFAULT 0
- `duration_seconds` INTEGER DEFAULT 0
- `modified_at` TEXT
- `created_at` TEXT
- `updated_at` TEXT
- `tmdb_id` INTEGER DEFAULT NULL
- `media_type` TEXT DEFAULT NULL
- `title` TEXT DEFAULT NULL
- `original_title` TEXT DEFAULT NULL
- `overview` TEXT DEFAULT NULL
- `poster_path` TEXT DEFAULT NULL
- `backdrop_path` TEXT DEFAULT NULL
- `release_date` TEXT DEFAULT NULL
- `vote_average` REAL DEFAULT 0
- `vote_count` INTEGER DEFAULT 0
- `genre_ids` TEXT DEFAULT NULL
- `cast_names` TEXT DEFAULT NULL
- `scraped_at` TEXT DEFAULT NULL

### virtual_folders 表
- `id` INTEGER PRIMARY KEY
- `name` TEXT UNIQUE
- `created_at` TEXT
- `updated_at` TEXT

### virtual_folder_videos 表
- `id` INTEGER PRIMARY KEY
- `virtual_folder_id` INTEGER (FK)
- `video_id` INTEGER (FK)
- `created_at` TEXT
- UNIQUE(virtual_folder_id, video_id)

### app_meta 表
- `key` TEXT PRIMARY KEY
- `value` TEXT
- `updated_at` TEXT

---

## 文件结构

| 文件 | 作用 |
|------|------|
| `electron/main.ts` | Electron 主进程（IPC 处理器、系统托盘） |
| `electron/tmdb.ts` | TMDB API 封装 |
| `electron/database.ts` | SQLite 数据库操作（含 TMDB 字段迁移） |
| `src/App.tsx` | 主界面：视频列表、标签搜索、工具栏、弹窗 |
| `src/components/VideoPlayer.tsx` | 内置视频播放器 |
| `src/global.d.ts` | TypeScript 全局类型 |
| `electron/electron-env.d.ts` | Electron 环境类型 |
| `vite.config.ts` | Vite 配置（含 preload 生成） |
| `electron-builder.json5` | 打包配置 |

## IPC 接口

| Handler | 作用 |
|---------|------|
| `database:get-meta` | 获取数据库元信息 |
| `library:get-snapshot` | 获取当前视频库快照 |
| `library:create-folder` | 创建虚拟文件夹 |
| `library:toggle-video-folder` | 切换视频所在的文件夹 |
| `library:scan-directory` | 扫描目录导入视频 |
| `library:cleanup-unsupported` | 清理不支持的格式 |
| `video:open` | 用默认播放器打开 |
| `video:get-thumbnail` | 获取缩略图 |
| `videos:delete` | 批量删除视频 |
| `tmdb:get-config` | 获取 TMDB 配置 |
| `tmdb:set-config` | 保存 TMDB API Key |
| `tmdb:scrape-video` | 刮削单个视频 |
| `tmdb:scrape-all` | 批量刮削所有视频 |
| `db:scan-for-databases` | 扫描所有数据库文件 |
| `db:select-database` | 切换到指定数据库 |
| `db:get-current-path` | 获取当前数据库路径 |
| `win:minimize` | 最小化窗口 |
| `win:close` | 关闭窗口 |
| `win:isMaximized` | 获取最大状态 |
| `win:maximize` | 切换最大状态 |

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Esc` | 退出播放器 |
| `ArrowLeft` | 上一个视频 |
| `ArrowRight` | 下一个视频 |
| `Ctrl+ArrowLeft` | 后退 5 秒 |
| `Ctrl+ArrowRight` | 前进 5 秒 |
| `Space` | 播放/暂停 |
| `F` | 全屏 |

## 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 类型检查
npm run typecheck
```

---

## 打包构建问题记录（2026-04-04）

### 修复清单

| # | 错误 | 原因 | 修复 | 文件 |
|---|------|------|------|------|
| 1 | `dirname is not defined` | ES module 格式下 `__dirname` 不存在 | 将 `__filename` 和 `__dirname` 定义移到文件最顶部（`createRequire` 和 `fileURLToPath` 之后）再使用 | `electron/main.ts` |
| 2 | `ENOTDIR, not a directory` | 生产环境中 `APP_ROOT` 指向只读的 `app.asar` 内部路径，导致 `fs.mkdir` 失败 | 开发环境和生产环境分离：生产环境 `userData` 使用可执行文件所在目录 `.videosorter/`，`RENDERER_DIST` 使用 `app.getAppPath()` | `electron/main.ts` |
| 3 | `duplicate column name: tmdb_id` | `PRAGMA table_info` 返回行格式为 `[cid, name, type, ...]`，但代码检查的是 `row[0]`（`cid`），所以永远找不到已存在的列名 | 将 `row[0]` 改为 `row[1]`（列名位置） | `electron/database.ts` |
| 4 | 黑屏（窗口打开但无内容） | 生产环境 `RENDERER_DIST` 指向 `exeDir + 'dist'`，但 `dist/` 在 `app.asar` 内部 | 生产环境使用 `app.getAppPath() + 'dist'`，开发环境使用 `APP_ROOT + 'dist'` | `electron/main.ts` |
| 5 | `ENOENT, sql-wasm.wasm not found in app.asar` | `getWasmPath()` 返回 `dist-electron/sql-wasm.wasm` 但该文件未被复制到 `dist-electron/` | 生产环境改为 `app.getAppPath() + 'node_modules/sql.js/dist/sql-wasm.wasm'`（该文件在 asar 中存在） | `electron/database.ts` |

### 构建输出目录

- 最新版本: `release-v8/0.1.0/`
- 安装包: `release-v8/0.1.0/YourAppName-Windows-0.1.0-Setup.exe`
- 便携版: `release-v8/0.1.0/win-unpacked/YourAppName.exe`

---

## 打包构建问题记录（2026-04-13）- v0.2.2

### 修复清单

| # | 错误 | 原因 | 修复 | 文件 |
|---|------|------|------|------|
| 6 | `找不到ffmpeg.dll` | `electron-builder.json5` 配置文件中存在**重复的 `win` 配置块**，后面的配置覆盖了前面的 `extraFiles` 配置 | 删除重复的 `win` 配置块，只保留包含 `extraFiles` 的配置 | `electron-builder.json5` |
| 7 | 文字溢出换行 | 侧边栏文件夹按钮和视频卡片的文本容器没有正确的宽度限制 | 1. 侧边栏宽度改为 `min(320px,25vw)` 自适应<br>2. 文本添加 `flex-1 min-w-0` 和 `truncate`<br>3. 使用 `clamp(0.8rem,2vw,1rem)` 实现响应式文字大小 | `src/App.tsx` |

### 重要提示

**⚠️ 避免配置重复键名**

JSON/JSON5 格式中，**后面的同名键会覆盖前面的键**。在 `electron-builder.json5` 中：

```json5
// ❌ 错误示例 - 后面的 win 会覆盖前面的
{
  "win": {
    "extraFiles": [{ "from": "...", "filter": ["ffmpeg.dll"] }]
  },
  // ... 其他配置 ...
  "win": {
    // 这个配置会完全覆盖上面的配置！
  }
}

// ✅ 正确示例 - 合并到一个配置中
{
  "win": {
    "target": [...],
    "extraFiles": [{ "from": "...", "filter": ["ffmpeg.dll"] }]
  }
}
```

### 构建输出目录

- 最新版本: `dist-build/0.2.2/`
- 安装包: `dist-build/0.2.2/VideoManager-Windows-0.2.2-Setup.exe`
- 便携版: `dist-build/0.2.2/win-unpacked/VideoManager.exe`
- 压缩包: `dist-build/0.2.2/VideoManager-Windows-0.2.2-x64.zip`
