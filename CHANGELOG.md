# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
