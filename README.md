<h1 align="center">VideoManager - 本地视频管理器</h1>

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
- 👆 **悬停预览** — 鼠标悬停 500ms 自动播放片段，无需打开播放器
- 🖼️ **随机封面** — 自动从视频 10%-50% 位置截取封面
- 🗂️ **播放列表导航** — 键盘左右箭头或按钮在视频间快速切换
- 🔍 **实时搜索** — 按名称或路径快速过滤，结果支持批量操作
- 📄 **分页浏览** — 每页 12 个视频，支持跳转首页/末页/上一页/下一页
- 🗑️ **批量删除** — 勾选复选框或删除当前页全部视频
- 🤖 **AI 智能分类** — 接入 OpenRouter API（支持 Qwen 等免费模型），输入分类规则后 AI 自动将未分类视频智能分配到虚拟文件夹，支持流式推理展示与可编辑预览
- 🖥️ **无边框窗口** — 自定义标题栏，支持最小化到系统托盘
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

1. 点击顶部「筛选器」（可选）设置最小/最大文件大小（MB）和要扫描的格式
2. 点击「扫描目录」选择文件夹
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

- **创建**：在左侧边栏输入名称并点击「创建虚拟文件夹」
- **添加视频**：点击视频卡片上的文件夹按钮
- **移除**：再次点击同一文件夹按钮即可取消关联
- **系统文件夹**：「全部视频」显示所有视频，「未分类」仅显示未分类视频

</details>

<details>
<summary><b>批量删除</b></summary>

1. 勾选视频卡片的复选框，或点击「全选」选中当前页
2. 点击「删除选中」确认删除
3. 删除操作不可撤销，同时清理数据库记录

</details>

<details>
<summary><b>播放列表与导航</b></summary>

- 点击「下一个」「上一个」按钮或键盘 ← → 键切换视频
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
| `start.bat` | Windows 快捷启动脚本 |

## ⚠️ 注意事项

- **预览**：浏览器中运行会显示模拟数据，仅在 Electron 窗口支持实际操作
- **封面生成**：首次加载视频封面需要读取视频元数据，可能需要几秒钟
- **悬停预览**：设 500ms 延迟避免频繁触发
- **刮削**：需要联网且 TMDB API Key 有效，结果返回中文语言信息
- **自动更新**：v0.2.1 开始支持 GitHub Releases 自动检测更新，需联网使用
- **数据迁移**：v0.2.1 首次启动时会自动将旧版本数据从安装目录迁移到 AppData，无需手动操作

## 📝 License

MIT
