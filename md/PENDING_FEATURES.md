# 待实现功能清单 (Pending Features List)

根据 `REQUIREMENTS.md` v3.0 与当前代码库的对比分析，以下功能尚未实现或需要进一步完善。

## 1. 核心工程化 (Core Engineering)
*   [ ] **自动更新 (Auto Update)**
    *   **状态**: 未实现。
    *   **缺失**: `package.json` 缺少 `electron-updater` 依赖，主进程未配置更新检测逻辑。
*   [ ] **系统集成**
    *   **状态**: 未实现。
    *   **缺失**: 全局快捷键 (`Alt+Space`) 唤起应用。
    *   **缺失**: 开机自启设置 (`app.setLoginItemSettings`)。

## 2. 上下文与效率 (Context & Efficiency)
*   [ ] **上下文可视化**
    *   **状态**: 未实现。
    *   **需求**: UI 上需要将超出上下文窗口（Current Window）的历史消息置灰，并显示分割线“AI 已遗忘此线以上内容”。
*   [ ] **Token 估算**
    *   **状态**: 未实现。
    *   **需求**: 简单的字符/Token 计数显示，帮助用户感知上下文消耗。

## 3. 高级智能 (Advanced Intelligence)
*   [ ] **文档分析 (RAG Lite)**
    *   **状态**: 部分实现 (仅支持图片)。
    *   **缺失**:
        *   前端文件选择器目前仅接受 `image/*`。
        *   不支持拖拽 PDF/TXT/Markdown 文件进入聊天框。
        *   后端缺少文档解析逻辑 (需集成 LangChain Document Loaders)。
*   [ ] **Prompt 市场 (快捷指令)**
    *   **状态**: 未实现。
    *   **需求**: 输入框支持 `/` 触发快捷指令菜单 (如 `/translate`, `/summary`)。

## 4. 性能优化 (Performance)
*   [ ] **虚拟滚动 (Virtual Scrolling)**
    *   **状态**: 未实现。
    *   **现状**: 侧边栏和消息列表目前使用普通渲染。当消息量巨大时可能会有性能问题。需引入 `react-window` 或 `react-virtuoso`。
