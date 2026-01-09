# AI Desktop Assistant

一个基于 Electron、React 和 SQLite 构建的 AI 桌面助手应用。

## 📋 项目介绍

AI Desktop Assistant 是一款功能强大的桌面应用，集成了 AI 助手功能，支持多种平台（macOS、Windows、Linux）。

### ✨ 主要功能

- 🤖 AI 对话功能
- 💬 自然语言交互
- 📁 本地数据存储（SQLite）
- 🖥️ 跨平台支持（macOS、Windows、Linux）
- 🔄 自动更新
- 📱 响应式设计

## 🚀 快速开始

### 系统要求

- Node.js 18.x 或更高版本
- npm 或 yarn 包管理器
- Git

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/yourusername/electron-react-ai-chat.git
   cd electron-react-ai-chat
   ```

2. **安装依赖**
   ```bash
   yarn install
   ```

3. **启动开发模式**
   ```bash
   yarn dev
   ```

4. **运行生产版本**
   ```bash
   yarn build:local:mac  # 构建 macOS 版本
   yarn start            # 运行构建后的应用
   ```

## 📦 打包应用

### 支持的平台

- macOS (arm64)
- Windows (x64)
- Linux (arm64)

### 本地构建

```bash
# 构建 macOS 版本
# 本地构建，不发布到 GitHub
yarn build:local:mac

# 构建 macOS 版本并公证
yarn build:local:mac:notarize

# 构建 Windows 版本
yarn build:local:win

# 构建 Linux 版本
yarn build:local:linux

# 构建所有平台版本
yarn build:local:all
```

### 远端构建（发布到 GitHub）

```bash
# 构建 macOS 版本并发布到 GitHub
yarn build:remote:mac

# 构建 macOS 版本并公证后发布到 GitHub
yarn build:remote:mac:notarize

# 构建 Windows 版本并发布到 GitHub
yarn build:remote:win

# 构建 Linux 版本并发布到 GitHub
yarn build:remote:linux

# 构建所有平台版本并发布到 GitHub
yarn build:remote:all
```

### 构建结果

构建完成后，安装包会生成在 `dist/` 目录下：

- **macOS**: `.dmg` 和 `.zip` 文件
- **Windows**: `.exe` 安装包和便携版 `.exe`
- **Linux**: `.AppImage` 和 `.deb` 包

## 🎯 项目结构

```
.
├── build/              # 构建资源
├── dist/               # 构建输出目录
├── out/                # 编译输出目录
├── scripts/            # 脚本文件
│   ├── bump-version.js # 版本更新脚本
│   └── notarize-app.js # macOS 公证脚本
├── src/                # 源代码
│   ├── main/           # 主进程代码
│   ├── preload/        # 预加载脚本
│   └── renderer/       # 渲染进程代码
├── .env                # 环境变量配置
├── package.json        # 项目配置
└── README.md           # 项目说明文档
```

## ⚙️ 配置说明

### 环境变量

项目使用 `.env` 文件管理环境变量：

```env
# Apple 开发者账号信息（用于 macOS 公证）
APPLE_ID=your-apple-id@example.com
APPLE_APP_SPECIFIC_PASSWORD=your-app-specific-password
APPLE_TEAM_ID=your-team-id

# GitHub Token（用于发布）
GH_TOKEN=your-github-token
```

### 构建配置

构建配置在 `package.json` 文件中，主要包括：

- `appId`: 应用唯一标识符
- `productName`: 应用名称
- `mac`: macOS 构建配置
- `win`: Windows 构建配置
- `linux`: Linux 构建配置
- `nsis`: Windows 安装包配置

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- GitHub Issues: [https://github.com/yourusername/electron-react-ai-chat/issues](https://github.com/yourusername/electron-react-ai-chat/issues)

## 🙏 致谢

- [Electron](https://www.electronjs.org/) - 跨平台桌面应用框架
- [React](https://react.dev/) - UI 库
- [Vite](https://vitejs.dev/) - 构建工具
- [SQLite](https://www.sqlite.org/) - 本地数据库
- [electron-builder](https://www.electron.build/) - 应用打包工具

---

**AI Desktop Assistant** - 让 AI 助手触手可及！ 🚀