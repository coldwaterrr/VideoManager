# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.2] - 2026-10-21

- 完整生成 Windows 安装版、便携版和 ZIP；补齐固定版本 FFmpeg 的下载校验、GitHub 更新源和正确的版本目录上传路径。
- 标签构建校验依赖、ZIP 完整性及更新 SHA-512，生成 SHA-256 清单后上传 Release 草稿供发行核验。
- 移除预览的固定 10fps 限制，保留原片帧率（最高 30fps），提高动作流畅度，同时保留随机 3–5 秒切段与下一段预载。
- 预览缓存版本升级为 r2，自动重建低帧率旧预览，继续复用封面。
- 验证 12、24、29.97fps 保持原速率，60fps 限至 30fps，以及旧缓存失效和真实播放换段。

## [0.6.1] - 2026-10-21

- 悬停预览改为随机片段轮播，每段 3–5 秒后自动切到其他位置，相邻片段不重复；短视频按实际长度播放。
- 按六个时间区间生成可复用的随机片段缓存，播放时预载下一段，通过两个视频缓冲切换，保留 100ms 防误触等待与静音。
- 复用已有封面缓存；随机片段使用新的缓存文件名，避免继续播放上一版固定位置的预览。
- 增加真实播放计时回归，验证自动换段、片段长度、来源位置不同、单片播放及鼠标离开停止。

## [0.6.0] - 2026-10-21

- 封面改用本机 FFmpeg 生成 JPEG 并写入磁盘缓存，按路径、大小和修改时间失效，重启后直接复用；卡片不再等待在线海报。
- 悬停等待从 650ms 降到 100ms，预览使用 4 秒、静音、低分辨率 H.264 缓存片段；当前页优先预热，最多两个生成任务并行，限制后台磁盘与 CPU 开销。
- 缓存约 1GB 时触发自动回收，可在设置中查看封面、预览数量和占用。缓存读取到的时长同步显示在卡片与当前筛选中。
- 新增“系列分组”：本地识别集数、Part/Chapter 编号、相近名称和同目录视频，先预览、修改名称与勾选成员，再保存。无需外部 AI 服务。
- 支持批量选择后手动组成系列、系列卡片折叠/展开、重命名和解散；分组随当前数据库保存，保持原文件与已有分类。
- 防止重复归组、过期建议和切库后保存；保存失败回滚内存状态。未知时长的短片、竖屏及特殊字符路径覆盖在测试中。

## [0.5.1] - 2026-10-21

- 修复标题栏和任务栏最小化被转换成隐藏窗口的问题；普通最小化保留任务栏入口。
- 补齐应用、任务栏和托盘图标，提供 16–256px 多尺寸 ICO、PNG 与内置备用图标，不再创建透明空图标。
- 托盘支持单击或双击恢复；右键菜单提供“打开、隐藏到托盘、退出”。退出时销毁托盘图标。
- 统一托盘、再次启动和激活应用的恢复逻辑，恢复前先解除最小化并显示窗口。
- 启动脚本根据 package.json 中的版本选择程序，继续使用原来的独立配置目录。
- 正常资源及缺失图标备用路径各通过 7 项真实 Electron 窗口/托盘检查。

## [0.5.0] - 2026-10-21

### 媒体库体验重构

- 重建深色工作台，固定侧栏、当前位置与状态栏；支持侧栏折叠、网格/列表切换及小窗口适配。
- 将导入、资源库管理、偏好设置分层；扫描条件放入导入弹窗，与已有视频筛选分开。
- 新增格式、标签、大小、时长组合筛选、可移除条件标签和一键清除；搜索支持 Ctrl K。
- 批量选择时点击封面即可选择；操作条集中加入/移出分类和移除记录，全选范围明确为全部筛选结果。
- 新建分类支持表单提交、错误提示和成功后导航；移除记录使用可取消的应用内确认弹窗，保留原文件。
- 封面按可见区域加载，解码并发上限 3，进程缓存上限 120；失败有占位，支持关闭悬停预览和减少动态效果。
- 统一弹窗焦点约束、Escape、焦点恢复和键盘可达性；播放器配置保存失败就地显示错误。
- 保留现有目录自动检测、规则与 AI 分类、清理、Web/MPV/系统播放能力。启动入口继续使用已有新版配置目录。

设计规范及验证方式见 [DESIGN.md](DESIGN.md)。

## [0.4.1] - 2026-10-21

基于 0.3.0 增加目录自动检测、失效路径清理、条件清理和批量分类，并修复播放及数据库问题。

### 资源库清理

- 自动失效清理默认关闭。启用后可设置检测间隔和连续确认次数，默认每 60 分钟检测、连续确认 2 次失效后清理。离线根目录、权限错误和恢复的路径会跳过并重置计数。
- 条件清理支持大小上下限、文件修改时间上下限、加入视频库时间上下限、文件名或路径关键词。多个条件取交集，至少设置一个条件才能预览；大小边界包含，时间下限包含、上限不含。
- 预览结果可全选或逐项勾选，确认后先备份数据库，再移除记录和分类关联，保留视频文件。过期预览、切库、预览后变化的记录受到保护。
- 条件清理保留文件指纹忽略记录，防止未变化的视频被下一轮扫描立即加回。文件大小或修改时间变化后可重新导入。

### 扫描与分类

- 多个目录可分别设置启用状态、大小范围、格式、递归、检测间隔和文件写入稳定时间。设置随数据库保存，程序运行或缩到托盘时生效，退出后停止。
- 增量扫描只新增和更新变化记录，保留时长、元数据和已有分类；单个文件消失不再回滚整次导入。
- 增加批量加入/移出分类、分类重命名、关键词规则预览，以及新视频导入时自动应用规则。
- 修复标签筛选被文件夹分支绕过、数据减少后分页空白、筛选后选择残留等问题。布局支持自适应卡片、折叠分类编辑和每页 12/24/48 条。

### 播放与数据可靠性

- 修复 Web 快进快捷键捕获初始时长 0 而跳回开头的问题；方向键和鼠标右键使用实时位置相对跳转。
- 编码本地文件 URL 中的空格、#、%、?，修复特殊文件名播放；同步静音和全屏状态。
- 修复 MPV 旧进程退出误清除新进程的竞态；等待 IPC 就绪，按 request_id 读取真实命令结果并返回错误。
- 数据库读取失败不再创建空库覆盖原文件；切库先验证候选库。持久化串行写入临时文件并替换，导出后恢复外键设置。
- 扫描事务不再跨异步文件 IO；分类应用使用事务并校验视频 ID。切库期间停止或忽略旧的分类/刮削任务。
- 修复标题栏最大化异步状态、窗口控制和刮削进度 IPC 名称，以及扫描监听清理问题。

### 验证与使用边界

- `npm run typecheck` 通过。
- `npm test` 的 15 项资源库检查和 14 项清理检查通过。
- 另通过 10 项真实 Electron 界面/媒体检查、5 项 MPV IPC 检查及生产构建和 Windows 打包验证。所有清理测试使用临时库和临时文件。
- TMDB/AI 在线服务未发送真实调用。条件筛选使用库中最近扫描的数据，可先增量扫描刷新；文件移动识别和大规模数据库分页仍可后续完善。

Windows 构建后可运行 `launch-preview.bat` 使用独立配置副本试用；直接打开打包目录中的程序沿用默认 AppData 视频库。

## [0.2.1] - 2026-04-08

### 🐛 Bug Fixes

- **MPV IPC handler mismatch**
  - 修复了 MPV 启动流程中的 handler 名称不一致问题
  - 统一了 preload.ts 和 main.ts 中的 IPC 方法名

- **MPV config loading**
  - 修复了配置未完全加载就启动 mpv 导致使用默认值的问题
  - 确保 `loadMpvConfig()` 完成后再进行 mpv 启动流程

- **MPV config persistence**
  - 修复了 `mpvPath` 保存后被空值覆盖的 bug
  - 改进了配置合并逻辑，核心路径设置不再丢失

- **Shader file detection**
  - 增强了 shader 文件存在性检查
  - 仅当 shader 文件实际存在时才添加到 mpv 参数中

### ✨ New Features

- **FSRCNNX Super Resolution**
  - 新增 FSRCNNX 超分辨率算法支持
  - 提供三种缩放倍率：x2、x3、x4
  - 适合写实/真人画面的通用超分方案
  - 补充了 `mpv/shaders/fsrcnnx/` 目录下的 3 个 shader 文件

- **Enhanced MPV Settings UI**
  - 改进了播放器设置界面的交互体验
  - 支持 granular 的 shader 选择（Anime4K / FSRCNNX / None）
  - 清晰的功能说明和使用建议

- **OSD Status Display**
  - mpv 启动时自动显示当前激活的超分和补帧设置
  - 用户可即时确认功能状态是否正确生效
  - OSD 显示格式：`超分: XXX | 补帧: 开/关`

- **Player Selection System**
  - 完整的播放器选择机制（内置播放器 / MPV / 系统默认）
  - 配置持久化，记住用户选择
  - 支持热切换播放器后端

### 🎛️ Improvements

- 配置文件存储位置：`.videosorter/mpv-config.json`
- 支持三种超分模式：Anime4K、FSRCNNX（x2/x3/x4）、无
- 补帧插值可配置目标帧率（默认 60fps）
- 自动检测 mpv.exe 路径，提供友好的错误提示
- 默认路径为项目根目录 `/mpv/`，内含 mpv.exe 和 shaders/

### 📝 Documentation

- 更新 README.md 和 PROJECT.md 中的播放器功能说明
- 在 README 中添加 FSRCNNX 超分和播放器选择的特性说明

---

## [0.2.0] - 2026-04-04

### 🎉 Initial Public Release

- 视频扫描与导入（mp4/mkv/avi/mov/wmv）
- TMDB 元数据刮削
- 虚拟文件夹管理
- 悬停预览功能
- AI 智能分类（OpenRouter API）
- 内置播放器
- 无边框窗口 + 系统托盘
- 多数据库支持

---

## Upgrade Notes

### From 0.2.0 to 0.2.1

This is a **feature enhancement release** focused on improving the MPV player experience:

1. **New**: FSRCNNX super resolution support (better for real-world footage)
2. **Improved**: More granular shader selection in settings
3. **Fixed**: MPV config loading and persistence issues
4. **Fixed**: IPC handler inconsistencies
5. **Added**: OSD feedback showing active super-resolution and interpolation settings

**No database migrations required** - all existing data remains compatible.

**Note**: If you previously used MPV with custom settings, it's recommended to:
- Review your mpv configuration in Settings → Player Settings
- Verify the shader selection (Anime4K vs FSRCNNX)
- Test playback with OSD feedback to confirm settings are applied

---

## File Comparison

- **Before**: Only Anime4K shaders were included
- **After**: Added FSRCNNX_x2/x3/x4 shaders for broader content support

- **Before**: MPV settings had potential race conditions
- **After**: Config loading fully awaited before launch

- **Before**: No feedback on active MPV settings
- **After**: OSD shows "超分: XXX | 补帧: 开/关" on launch
