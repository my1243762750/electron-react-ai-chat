# Electron AI 客服项目 - 技术风险与挑战备忘录

本文档记录了随着项目规模扩大，从简单的 Hello World 演进为生产级 AI 客服应用时，预计会遇到的技术难点与挑战。

## 1. 性能挑战 (Performance)

### 1.1 大量消息渲染 (Rendering Large Lists)
*   **场景**：当聊天记录积累到几千条，或者用户请求导出长对话时。
*   **现象**：DOM 节点过多（>3000个），导致页面滚动卡顿，内存飙升，甚至白屏。
*   **挑战**：Electron 的渲染进程本质是浏览器，受限于 Chrome 的渲染管线。
*   **解决方案预演**：
    *   实现 **虚拟列表 (Virtual List)**：只渲染可视区域内的消息。
    *   实现 **分页加载/懒加载**：历史消息滚动到顶部时再从本地数据库读取。

### 1.2 流式响应造成的 IPC 压力 (Streaming IPC Overhead)
*   **场景**：AI 模型（如 ChatGPT）通常是流式（Stream）返回数据的，每秒可能推送几十个 token。
*   **现象**：如果每一个 token 都触发一次 `ipcMain.send`，会导致 CPU 占用过高，因为进程间通信是有序列化成本的。
*   **挑战**：如何在保证“打字机效果”流畅的同时，减少 IPC 通信频率。
*   **解决方案预演**：
    *   **批处理 (Batching)**：在主进程缓存 buffer，每 50ms 或 100ms 发送一次数据包给渲染进程。

### 1.3 内存泄漏 (Memory Leaks)
*   **场景**：用户长时间挂机不关闭应用。
*   **现象**：内存占用从 100MB 慢慢涨到 1GB+，最终 OOM (Out of Memory) 崩溃。
*   **挑战**：Node.js 的闭包引用和 DOM 事件监听器未解绑是常见杀手。
*   **解决方案预演**：
    *   使用 Chrome DevTools 的 Memory 面板定期进行堆快照 (Heap Snapshot) 分析。

## 2. 工程化与原生能力 (Native Capabilities)

### 2.1 本地数据库集成 (Local Database)
*   **场景**：需要保存聊天记录、用户设置，且要求离线可用。
*   **挑战**：
    *   使用 `localStorage` 容量太小且不安全。
    *   使用 `sqlite3` 或 `better-sqlite3` 涉及 **Native Module** 编译，跨平台打包容易出错（Windows vs Mac）。
*   **解决方案预演**：
    *   使用纯 JS 的数据库（如 `lowdb`, `rxdb`）作为初期方案。
    *   后期引入 `sqlite3` 时，配置 `electron-rebuild` 自动编译流程。

### 2.2 自动更新 (Auto Updater)
*   **场景**：修复 Bug 后，希望用户无感升级。
*   **挑战**：macOS 需要代码签名（Code Signing）才能使用官方的自动更新机制，否则需要自己搭建更新服务。
*   **解决方案预演**：
    *   配置 `electron-updater`。
    *   解决签名证书问题（开发阶段忽略，生产阶段必须购买）。

## 3. 安全性 (Security)

### 3.1 AI 内容渲染的安全 (Markdown/HTML Rendering)
*   **场景**：AI 返回的内容包含 Markdown，其中可能混入恶意的 HTML/JS 代码（Prompt Injection 攻击）。
*   **现象**：AI 输出 `<img src=x onerror=alert(1)>`，导致应用执行恶意代码。
*   **挑战**：在富文本渲染和安全之间通过 CSP (Content Security Policy) 找到平衡。
*   **解决方案预演**：
    *   使用 `DOMPurify` 在渲染前清洗所有 AI 返回的 HTML。
    *   严格配置 CSP，禁止 `unsafe-inline` 脚本。

## 4. 架构设计 (Architecture)

### 4.1 多窗口状态同步 (Multi-Window State Sync)
*   **场景**：用户打开了“设置窗口”修改了主题色，主聊天窗口需要立即变色。
*   **挑战**：不同渲染进程之间内存不共享。
*   **解决方案预演**：
    *   将状态管理（State Management）下沉到主进程，渲染进程只负责 View 层展示。
    *   使用 IPC 广播机制通知所有窗口更新。

---
*创建日期：2026-01-05*
