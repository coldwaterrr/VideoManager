# Raycast风格UI重构完成计划

## 背景
在之前的会话中，已完成大部分Raycast风格UI重构：
- ✅ 阶段一：CSS变量（style.css）
- ✅ 阶段二：基础组件（Button、Input）
- ✅ 阶段三：TitleBar
- ✅ 阶段四：App.tsx（主要部分，侧边栏/卡片/对话框）
- ✅ 阶段五：VideoPlayer.tsx 完全更新

## 剩余工作

### 阶段一：完成 MpvPlayer.tsx（约11处旧样式引用）
**文件：** `e:\videomanager\VideoManager\src\components\MpvPlayer.tsx`

需更新的具体行（通过grep扫描得出）：
1. **播放列表面板**：`bg-zinc-900/95` → `bg-[#141416]/95`
2. **设置面板**：`bg-zinc-900` → `bg-[#1a1a1c]`
3. **着色器选择按钮**：`bg-zinc-800` → `bg-[#1e1e20]`，激活态 `bg-violet-500` → `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]`
4. **占位文字**：`text-zinc-400` → `text-zinc-500`
5. **边框**：`border-zinc-800` → `border-[#2a2a2e]`

**修改规则：**
- `bg-zinc-900` → `bg-[#141416]`
- `bg-zinc-800` → `bg-[#1e1e20]`
- `bg-violet-500` → `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]`
- `border-zinc-800` → `border-[#2a2a2e]`
- `text-zinc-400` → `text-zinc-500`

---

### 阶段二：更新 SettingItem.tsx
**文件：** `e:\videomanager\VideoManager\src\components\SettingItem.tsx`

需更新内容：
1. **开关按钮（Toggle）**：
   - 开启态背景：`bg-violet-500` → `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]`
   - 关闭态背景：`bg-zinc-600` → `bg-[#2a2a2e]`
   - 滑块阴影：增加发光效果

2. **详情面板**：
   - 背景：`bg-zinc-800` → `bg-[#1a1a1c]`
   - 边框：`border-zinc-700` → `border-[#2a2a2e]`

3. **标签和文字**：
   - 次要文字颜色统一调整

---

### 阶段三：更新 PlayerSelector.tsx
**文件：** `e:\videomanager\VideoManager\src\components\PlayerSelector.tsx`

需更新内容：
1. **触发按钮**：
   - 背景：`bg-zinc-800` → `bg-[#1e1e20]`
   - 悬停：`hover:bg-zinc-700` → `hover:bg-[#2a2a2e]`
   - 边框：`border-zinc-700` → `border-[#2a2a2e]`

2. **下拉菜单**：
   - 背景：`bg-zinc-800` → `bg-[#1a1a1c]`
   - 选项悬停：`hover:bg-zinc-700` → `hover:bg-[#2a2a2e]`
   - 激活选项：`bg-violet-500` → `bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]`

---

### 阶段四：全局最终检查
使用Grep工具搜索所有剩余的旧样式引用：
1. 搜索 `bg-violet-` → 确认全部替换为渐变
2. 搜索 `bg-zinc-800` / `bg-zinc-900` → 确认替换为 `bg-[#1a1a1c]` / `bg-[#141416]`
3. 搜索 `border-zinc-700` / `border-zinc-800` → 确认替换为 `border-[#2a2a2e]`
4. 搜索 `text-zinc-400` → 视情况调整
5. 检查 App.tsx 剩余3处旧样式引用：
   - line ~39（渐变引用）
   - line ~1840（emerald渐变）
   - line ~1961（orange-500/20）

---

### 阶段五：TypeScript类型检查
```bash
cd e:\videomanager\VideoManager
npx tsc --noEmit
```
确保无类型错误。

---

### 阶段六：构建打包
1. 临时修改 `electron-builder.json5` 输出目录为 `build-release/`（避免占用）
2. 执行 `npm run build`
3. 验证构建产物完整性和大小
4. 恢复输出目录配置为 `release/`

---

### 阶段七：创建Release
1. 更新版本号至 `0.2.4`（package.json）
2. 使用正确的输出目录重新构建
3. 创建GitHub Release v0.2.4
4. 确保 `latest.yml` 等自动更新文件完整上传

---

## 风险注意事项
1. **功能不变原则**：所有修改仅限于CSS类名/颜色值，不改变任何逻辑代码
2. **渐变兼容性**：某些组件可能不支持直接替换为渐变，需使用 `bg-gradient-to-r` 配合 `from-[#6366f1] to-[#8b5cf6]`
3. **构建占用问题**：使用临时输出目录避免文件锁定
4. **MpvPlayer覆盖层**：注意z-index层叠关系保持不变

## 预估影响文件
- `src/components/MpvPlayer.tsx` - 主要修改
- `src/components/SettingItem.tsx` - 中等修改
- `src/components/PlayerSelector.tsx` - 中等修改
- `src/App.tsx` - 少量补充修改（3-5行）
- `package.json` - 版本号更新
- `electron-builder.json5` - 临时输出目录修改
