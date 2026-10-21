import {
  Clapperboard,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Inbox,
  Settings2,
  HardDrive,
  WandSparkles,
  ShieldCheck,
  ListFilter,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
} from 'lucide-react'

export type LibraryFolder = { id: string; name: string; count: number; system: boolean }
type ToolTab = 'monitor' | 'cleanup' | 'conditional' | 'rules'

export function LibrarySidebar({
  folders,
  activeId,
  onNavigate,
  onCreate,
  onManageFolder,
  onTool,
  onSettings,
  onSeries,
  disabled,
  totalSize,
  lastDirectory,
  collapsed,
  onCollapse,
}: {
  folders: LibraryFolder[]
  activeId: string
  onNavigate: (id: string) => void
  onCreate: () => void
  onManageFolder: (folder: LibraryFolder, x: number, y: number) => void
  onTool: (tab: ToolTab) => void
  onSettings: () => void
  onSeries: () => void
  disabled: boolean
  totalSize: string
  lastDirectory: string | null
  collapsed: boolean
  onCollapse: () => void
}) {
  return (
    <aside className={`library-sidebar ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="brand">
        <span className="brand-mark">
          <Clapperboard size={23} strokeWidth={1.7} />
        </span>
        <div className="sidebar-label">
          <strong>VideoManager</strong>
          <span>让每一段影像井然有序</span>
        </div>
      </div>
      <button
        className="sidebar-collapse icon-button"
        onClick={onCollapse}
        aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
        title={collapsed ? '展开侧栏' : '收起侧栏'}
      >
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>
      <nav aria-label="视频库导航" className="sidebar-navigation">
        <div className="nav-caption sidebar-label">视频库</div>
        {folders
          .filter((folder) => folder.system)
          .map((folder) => (
            <button
              key={folder.id}
              className={`nav-item ${folder.id === activeId ? 'active' : ''}`}
              aria-current={folder.id === activeId ? 'page' : undefined}
              onClick={() => onNavigate(folder.id)}
              title={folder.name}
            >
              {folder.id === 'all' ? <Film size={18} /> : <Inbox size={18} />}
              <span className="sidebar-label nav-name">{folder.name}</span>
              <span className="sidebar-label nav-count">{folder.count.toLocaleString()}</span>
            </button>
          ))}
        <div className="nav-caption collections-caption">
          <span className="sidebar-label">我的分类</span>
          <button
            className="icon-button"
            disabled={disabled}
            onClick={onCreate}
            aria-label="新建分类"
            title="新建分类"
          >
            <FolderPlus size={16} />
          </button>
        </div>
        {folders
          .filter((folder) => !folder.system)
          .map((folder) => (
            <div className="folder-nav-row" key={folder.id}>
              <button
                className={`nav-item ${folder.id === activeId ? 'active' : ''}`}
                aria-current={folder.id === activeId ? 'page' : undefined}
                onClick={() => onNavigate(folder.id)}
                title={folder.name}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onManageFolder(folder, event.clientX, event.clientY)
                }}
              >
                {folder.id === activeId ? <FolderOpen size={17} /> : <Folder size={17} />}
                <span className="sidebar-label nav-name">{folder.name}</span>
                <span className="sidebar-label nav-count">{folder.count.toLocaleString()}</span>
              </button>
              <button
                className="folder-more icon-button"
                aria-label={`管理分类 ${folder.name}`}
                title={`管理分类 ${folder.name}`}
                disabled={disabled}
                onClick={(event) => {
                  event.stopPropagation()
                  const rect = event.currentTarget.getBoundingClientRect()
                  onManageFolder(folder, rect.right, rect.bottom)
                }}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          ))}
        {folders.every((folder) => folder.system) && (
          <button className="nav-empty sidebar-label" disabled={disabled} onClick={onCreate}>
            创建第一个分类
          </button>
        )}
        <div className="nav-caption sidebar-label tools-caption">整理工具</div>
        {(
          [
            { tab: 'monitor', label: '目录管理', icon: HardDrive },
            { tab: 'rules', label: '规则分类', icon: WandSparkles },
            { tab: 'cleanup', label: '检查失效路径', icon: ShieldCheck },
            { tab: 'conditional', label: '条件清理', icon: ListFilter },
          ] as const
        ).map((item) => (
          <button
            className="nav-item"
            key={item.tab}
            disabled={disabled}
            onClick={() => onTool(item.tab)}
            title={item.label}
          >
            <item.icon size={17} />
            <span className="sidebar-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <button className="nav-item" onClick={onSeries} disabled={disabled} title="系列分组"><Layers size={17} /><span className="sidebar-label">系列分组</span></button>
      <div className="sidebar-bottom">
        <div className="library-location sidebar-label">
          <div>
            <span className="connection-dot" />
            本地资源库<span>{totalSize}</span>
          </div>
          <p title={lastDirectory || '尚未导入目录'}>{lastDirectory || '导入目录，开始整理影像'}</p>
        </div>
        <button className="nav-item" onClick={onSettings} title="设置与偏好">
          <Settings2 size={18} />
          <span className="sidebar-label">设置与偏好</span>
        </button>
      </div>
    </aside>
  )
}
