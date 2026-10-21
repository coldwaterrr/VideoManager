<h1 align="center">VideoManager - 本地视频管理器</h1>

本地优化版 **0.6.2**：磁盘封面缓存、100ms 悬停随机片段预览（跟随原片帧率，最高 30fps）、当前页预热，以及按编号、名称、目录识别和折叠系列。保留媒体库组合筛选、批量操作、托盘、自动目录检测、分类、备份清理和播放器能力。设计规范见 [DESIGN.md](DESIGN.md)，完整记录见 [更新记录](CHANGELOG.md)。

Windows 构建后可双击仓库内的 `launch-preview.bat`，使用原视频库的独立副本试用；配置保存在本地 `profiles/` 目录。目录检测在程序运行或缩至托盘时工作，退出后停止。

<p align="center">
  基于 Electron + React + TypeScript 的桌面视频管理工具，支持 TMDB 元数据刮削、AI 智能分类、虚拟文件夹、悬停预览。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-30-blue?style=for-the-badge&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite" alt="Vite">
  <img src="https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=for-the-badge&logo=tailwindcss" alt="Tailwind">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
</p>

## ✨ 特性

- 🎬 **智能扫描** — 递归扫描目录，支持多种格式筛选（mp4 / mkv / avi / mov / wmv），可按文件大小过滤
- 🏷️ **TMDB 元数据刮削** — 自动匹配电影/电视信息（海报、简介、评分、演员），支持智能书名号标题提取
- 📁 **虚拟文件夹** — 无需移动物理文件，创建虚拟分类文件夹管理视频
- 👆 **悬停预览** — 悬停 100ms 后静音播放随机片段，每段 3–5 秒后自动换段，预载下一段并复用磁盘缓存
- 🖼️ **本地封面** — 本机 FFmpeg 截帧，按可见区域加载；文件变化后更新，约 1GB 自动回收
- 🗃️ **系列分组** — 按编号、相近名称或所在目录生成可编辑建议，也可勾选视频手动组成系列，支持折叠与展开
- 🗂️ **播放列表导航** — 按钮在视频间切换，方向键用于快退/快进 5 秒
- 🔍 **实时搜索** — 按名称或路径快速过滤，结果支持批量操作
- 📄 **分页浏览** — 每页可选 12/24/48 个视频，支持上一页/下一页与输入页码直达
- 🗑️ **记录清理** — 按条件预览勾选后清理，或启用自动失效清理；保留视频文件
- 🤖 **AI 智能分类** — 接入 OpenRouter API（支持 Qwen 等免费模型），输入分类规则后 AI 自动将未分类视频智能分配到虚拟文件夹，支持流式推理展示与可编辑预览
- 🖥️ **无边框窗口** — 自定义标题栏，最小化保留任务栏图标；托盘支持单击恢复及右键主动隐藏、退出
- 🔄 **自动更新** — 基于 GitHub Releases，旧版本可检测并升级到最新版
- 💾 **数据安全** — 用户数据库存储在 AppData，安装更新不丢失数据，旧版本自动迁移
- 🎥 **高级播放器** — 集成 MPV 播放器，支持独立图形界面窗口播放
- 🎞️ **超分辨率增强** — 可选 Anime4K（动漫优化）或 FSRCNNX（通用）AI 超分算法
- 🎬 **补帧插值** — 将低帧率视频提升至更高帧率显示，使动作更流畅（如 24fps → 60fps）
- ⚙️ **播放器可配置** — 灵活选择内置播放器、MPV 或系统默认播放器

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
# 或双击 start.bat 启动
```

### 构建应用

```bash
npm run build
```

`prepare:media`（构建时自动运行）优先复用本机 FFmpeg；Windows x64 缺失时下载固定的 9.0.2 essentials 构建，并校验 SHA-256。也可设置 `VIDEOMANAGER_FFMPEG_PATH`。打包后用户无需另装 FFmpeg。媒体缓存保存在所用配置目录的 `media-cache/v2/` 下。

Windows 构建输出到 `release/<版本>/`，包含 Setup 安装版、Portable 便携版、ZIP、更新描述与 blockmap。执行 `npm run verify:release` 校验包内依赖、ZIP 完整性、更新文件哈希和用户数据排除，并生成 `SHA256SUMS.txt`。

推送与 package.json 一致的 `v<版本>` 标签后，GitHub Actions 准备依赖、检查源码、构建并校验发行包，上传为 Release 草稿。核验下载和运行后再将草稿发布为正式版本；普通分支 push 不发版。

### 系列分组

左侧「系列分组」→「生成分组建议」，核对系列名称和成员后保存。智能规则优先识别 Part、Chapter、集数和序号，再检查专用目录；“按所在目录”可列出通用目录的候选。匹配不合适时可取消建议，或批量勾选视频后点击「组成系列」。列表工具条的「系列」开关控制折叠，点击系列卡片展开。分组保存在当前数据库中，不移动视频，不调用外部 AI。

## 📦 下载

从 [GitHub Releases](https://github.com/coldwaterrr/VideoManager/releases) 获取最新版本：

| 版本 | 说明 |
|------|------|
| Setup.exe | NSIS 安装包（推荐） |
| Portable.exe | 免安装便携版 |
| x64.zip | 压缩包 |

## 📖 使用指南

<details>
<summary><b>扫描视频文件</b></summary>

1. 点击「导入视频」，按需展开「导入条件」设置大小和格式
2. 点击「选择目录并扫描」选择文件夹
3. 应用会递归扫描并显示进度，找到的视频自动加入数据库

</details>

<details>
<summary><b>TMDB 元数据刮削</b></summary>

1. 在设置中配置 TMDB API Key
2. 对视频进行元数据刮削，自动提取电影名、年份、海报、简介、评分等
3. 智能解析：优先提取《书名号》内容，自动识别多种文件名格式

支持的文件名示例：
- `[crazecat]2024年美国喜剧爱情片《阿诺拉》1080P.HD.中英双字.mp4`
- `The.Matrix.1999.BluRay.1080p.x264.DTS.mkv`
- `[www.example.com]2023年科幻片《流浪地球2》BD1080P.中字.mp4`
- `Oppenheimer.2023.2160p.WEB-DL.HDR.x265.DTS.mkv`

</details>

<details>
<summary><b>管理虚拟文件夹</b></summary>

- **创建**：点击左侧「我的分类」旁的加号，输入名称并点击「创建分类」
- **添加视频**：点击视频卡片上的文件夹按钮
- **移除**：再次点击同一文件夹按钮即可取消关联
- **系统文件夹**：「全部视频」显示所有视频，「未分类」仅显示未分类视频

</details>

<details>
<summary><b>批量删除</b></summary>

1. 点击「批量选择」，勾选卡片或全选当前筛选结果（跨分页）
2. 点击「移除记录」，核对提示后确认
3. 移除资源库记录和分类关联，保留原视频文件；条件清理与失效清理执行前会备份数据库

</details>

<details>
<summary><b>播放列表与导航</b></summary>

- 点击「下一个」「上一个」按钮切换视频；键盘 ← → 快退/快进 5 秒，鼠标右键前进 5 秒
- 点击播放列表面板图标查看所有视频
- 显示当前位置 `X / Total` 计数

</details>

<details>
<summary><b>✨ AI 智能分类</b></summary>

1. 在设置中配置 OpenRouter API Key 和 Base URL（默认 `https://openrouter.ai/api/v1`）
2. 点击「测试连接」验证 API 可用性
3. 进入 AI 分类面板，输入分类规则（如"按题材和年代分类"），点击「开始分类」
4. AI 将流式输出推理过程与分类方案，你可以审查并修改文件夹名称
5. 点击「应用」将分类结果写入虚拟文件夹

模型推荐：`qwen/qwen3.6-plus:free`（免费、快速、中文支持好）

</details>

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 30 + React 19 + TypeScript 5.9 |
| 构建 | Vite 7 + vite-plugin-electron |
| 样式 | Tailwind CSS 4 |
| 数据库 | SQLite (sql.js WASM) |
| 图标 | Lucide React |
| UI | Shadcn UI 风格组件 |
| 自动更新 | electron-updater (GitHub Releases) |

## 📂 项目结构

```
videomanager/
├── electron/                      # Electron 主进程
│   ├── main.ts                   # 入口，IPC 处理器
│   ├── database.ts               # SQLite 数据库管理
│   ├── preload.cjs               # 预加载脚本（纯 JS）
│   ├── tmdb.ts                   # TMDB 元数据刮削
│   └── ai.ts                     # AI 分类与 OpenRouter API
├── src/
│   ├── App.tsx                   # 主应用
│   ├── components/
│   │   ├── VideoPlayer.tsx      # 播放器（含播放列表导航）
│   │   ├── TitleBar.tsx         # 自定义标题栏
│   │   └── ui/                  # UI 基础组件
│   ├── global.d.ts              # 全局类型
│   └── style.css                # 全局样式
├── .videosorter/                  # 数据目录
├── start.bat                     # Windows 启动脚本
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 🗄️ 数据库

### videos

| 字段 | 说明 |
|------|------|
| `id` | 主键 |
| `absolute_path` | 视频路径（唯一） |
| `file_name` | 文件名 |
| `file_size` | 大小（字节） |
| `duration_seconds` | 时长（秒） |
| `modified_at` | 修改时间 |
| **TMDB 字段** | `tmdb_id`, `media_type`, `title`, `original_title`, `overview`, `poster_path`, `backdrop_path`, `release_date`, `vote_average`, `vote_count`, `genre_ids`, `cast_names`, `scraped_at` |

### virtual_folders

| 字段 | 说明 |
|------|------|
| `id` | 主键 |
| `name` | 文件夹名称 |
| `created_at` | 创建时间 |

### virtual_folder_videos

| 字段 | 说明 |
|------|------|
| `id` | 主键 |
| `virtual_folder_id` | 文件夹 ID |
| `video_id` | 视频 ID |

## ⚙️ 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 + Electron 窗口 |
| `npm run build` | Vite 打包 + electron-builder 打包 |
| `npm run preview` | Vite 预览 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test:window` | 构建并检查最小化、托盘恢复和退出 |
| `npm run icons` | 从 SVG 重新生成应用与托盘图标 |
| `npm run test:ui` | 构建并运行播放和媒体库交互检查（需要本地测试视频） |
| `npm run test:media` | 检查磁盘缓存、短片编码、重启复用和系列读写保护 |
| `npm run prepare:media` | 准备打包用的本机 FFmpeg |
| `npm run verify:release` | 验证 Windows 发行包与更新描述，生成 SHA-256 校验清单 |
| `start.bat` | Windows 快捷启动脚本 |

## ⚠️ 注意事项

- **预览**：浏览器中运行会显示模拟数据，仅在 Electron 窗口支持实际操作
- **封面生成**：首次访问需要读取和解码原片，大文件、慢盘、特殊编码仍可能花几秒；后续优先读取持久缓存
- **悬停预览**：100ms 防误触等待，播放小尺寸静音缓存片段；设置可关闭，批量选择及减少动态效果偏好下暂停
- **刮削**：需要联网且 TMDB API Key 有效，结果返回中文语言信息
- **自动更新**：v0.2.1 开始支持 GitHub Releases 自动检测更新，需联网使用
- **数据迁移**：v0.2.1 首次启动时会自动将旧版本数据从安装目录迁移到 AppData，无需手动操作

## 📝 License

MIT
