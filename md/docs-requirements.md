# AI 个人桌面助手 (AI Desktop Assistant) - 产品需求文档 (PRD) v3.0 (Final)

> **文档变更记录**
> *   v1.0: 初始版本。
> *   v2.0: 修正产品定位，增加安全与 Token 策略。
> *   v3.0: **工程化落地版**。采纳技术顾问建议，提前引入 SQLite，优化 IPC 通信策略，补充自动更新。

## 1. 产品概述
打造一个**高性能、隐私优先、深度集成系统**的 AI 桌面生产力工具。
主打：**极致效率** (快捷键唤起)、**隐私安全** (本地存储)、**工程健壮性** (自动更新、SQLite)。

## 2. 功能规划 (Feature Roadmap)

### 阶段一：MVP (最小可行性产品) - 核心对话闭环
*   [ ] **配置管理**：
    *   **安全存储**：使用 Electron `safeStorage` API 加密存储 API Key。
    *   **自动更新**：集成 `electron-updater`，支持后台检测更新。
*   [ ] **智能对话**：
    *   **流式响应 (Streaming)**：实现打字机效果。
        *   *技术约束*：**必须实现 IPC 节流 (Throttling)**，主进程每积攒 50ms 或 20 字符再发送一次 IPC 消息，避免 CPU 飙升。
    *   **控制权**：用户可随时点击“停止生成”。
    *   **Markdown**：代码高亮、数学公式、代码块“复制”按钮。
*   [ ] **数据存储 (直接上 SQLite)**：
    *   放弃 JSON 文件存储，直接集成 `better-sqlite3` + `knex/prisma`。
    *   设计 `conversations` (会话) 和 `messages` (消息) 两张表。
*   [ ] **异常处理**：
    *   **断网拦截 (Pre-check)**：在发送前检查 `navigator.onLine`，断网状态下禁止消息上屏并提示。
    *   **后端事务控制**：新会话只有在 API 握手成功（收到首个 Token）后才创建数据库记录，彻底杜绝断网产生的“垃圾空会话”。
    *   **超时与错误映射**：API 请求 15秒超时保护；将 `net::ERR_` 等底层错误码映射为友好的用户提示。
    *   **UI 容错**：React Error Boundary 防止白屏；Toast 组件展示全局通知。
    *   **Thinking 状态优化**：在 AI 思考（Loading）且无内容时，显示极简跳动动画（LoadingDots），隐藏对话框边框，避免出现“空心框”视觉残留。

### 阶段二：上下文与效率
*   [ ] **上下文策略**：
    *   **滑动窗口**：设置“携带最近 N 轮”。
    *   **UI 反馈**：**被截断的历史消息在 UI 上置灰**，并显示分割线“AI 已遗忘此线以上内容”。
    *   **Token 估算**：MVP 阶段采用**简单字符估算** (1汉字 ≈ 2 Token)，不引入重型 Tokenizer。
*   [ ] **会话管理**：
    *   侧边栏列表 (虚拟滚动)、重命名、删除。
    *   **懒创建策略**：点击 "New Chat" 时仅清空界面，不创建数据库记录；直到发送首条消息时才真正创建会话。
    *   **AI 智能命名**：首条消息发送后，调用大模型生成简短标题 (20字以内)，而非简单截取。
*   [ ] **系统集成**：
    *   全局快捷键 (`Alt+Space`)、开机自启。

### 阶段三：高级智能 (Advanced Intelligence)
*   [ ] **深度思考 (Deep Thinking / R1)**：
    *   **推理模型集成**：支持切换 DeepSeek R1 (`deepseek-reasoner`) 模型。
    *   **思维链可视化**：解析 API 返回的 `reasoning_content`，在 UI 中以可折叠的灰色区域展示 AI 的思考过程。
*   [ ] **联网搜索 (Web Search)**：
    *   **实时信息**：通过 API 参数开启联网能力（依赖模型支持），回答基于实时数据。
    *   **引用来源**：如果 API 返回来源链接，在 UI 上展示角标引用。
*   [ ] **简易 RAG (文件分析)**：
    *   **文件拖拽**：支持将 PDF/TXT/代码文件拖入聊天框。
    *   **上下文注入**：读取文件内容并作为 Prompt 上下文发送，实现基于文档的问答。
*   [ ] **Prompt 市场 (快捷指令)**：
    *   输入 `/` 呼出快捷菜单（如 `/translate`, `/polish`）。

## 3. 技术规范 (Technical Specs)

### 3.1 性能指标
*   **渲染性能**：对话列表必须实现**虚拟滚动**。
*   **通信性能**：流式传输必须有**Batching/Throttling** 机制。

### 3.2 架构设计
*   **主进程 (Main)**：
    *   负责：API 请求、SQLite 读写、Key 加密、自动更新。
*   **渲染进程 (Renderer)**：
    *   负责：UI 展示、虚拟列表渲染。
    *   通信：通过 `ipcRenderer.invoke` (请求/响应) 和 `ipcRenderer.on` (流式接收) 交互。

### 3.3 安全性
*   **CSP**：严格配置。
*   **HTML 清洗**：`DOMPurify`。

## 4. 技术栈确认
*   **Core**: Electron, Node.js
*   **UI**: React, TailwindCSS, Radix UI (组件库)
*   **State**: Zustand
*   **DB**: **better-sqlite3** (SQLite)
*   **Updater**: electron-updater
