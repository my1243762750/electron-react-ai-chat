# Electron + LangChain 生产环境打包依赖指南

本指南记录了在 Electron 环境下集成 LangChain 时，为解决 `Module not found` 和 `ERR_REQUIRE_ESM` 等运行时错误而必须显式安装或降级的所有依赖包。

> **背景**: Electron 主进程（Main Process）默认运行在 CommonJS (CJS) 环境，而 LangChain 依赖树中大量使用了动态引用（Dynamic Requires）或已转向 Pure ESM 的新版库，导致 `electron-builder` 打包时依赖丢失或版本不兼容。

## 1. 核心依赖清单 (Dependencies)

以下是最终生效的 `package.json` 中的关键依赖及其版本。在初始化项目时，请务必参考此清单。

### 1.1 必须降级以兼容 CJS 的库
这些库的最新版已转为 Pure ESM，必须锁定在最后一个支持 CommonJS 的旧版本，否则会报 `ERR_REQUIRE_ESM`。

| 依赖包 | 锁定版本 | 说明 |
| :--- | :--- | :--- |
| `better-sqlite3` | **`^11.8.1`** | **重要**: v12+ 在某些构建中不稳定，建议锁死 v11.x。且需配置 `asarUnpack`。 |
| `uuid` | **`^9.0.1`** | v10+ 仅支持 ESM，必须降级到 v9。 |
| `p-queue` | **`6.6.2`** | v7+ 仅支持 ESM，必须降级到 v6。 |
| `p-timeout` | **`4.1.0`** | v5+ 仅支持 ESM，必须降级到 v4 (p-queue 的依赖)。 |
| `decamelize` | **`^5.0.0`** | v6+ 仅支持 ESM，必须降级到 v5。 |
| `ansi-styles` | **`^5.2.0`** | v6+ 仅支持 ESM，必须降级到 v5。 |
| `camelcase` | **`6`** | v7+ 仅支持 ESM，必须降级到 v6。 |

### 1.2 必须显式补全的“隐形”依赖
这些库是 LangChain 的深层依赖或 Peer Dependencies，打包工具无法通过静态分析自动识别，必须手动添加到 `dependencies` 中。

| 依赖包 | 版本 (参考) | 作用 |
| :--- | :--- | :--- |
| `bindings` | `^1.5.0` | **关键**: `better-sqlite3` 加载 Native 模块所需，缺了会报 `Cannot find module 'bindings'`。 |
| `file-uri-to-path` | `^2.0.0` | `bindings` 的依赖，建议一并补全。 |
| `openai` | `^6.15.0` | 即使通过 LangChain 调用，也必须显式安装。 |
| `langsmith` | `^0.4.5` | LangChain 追踪功能依赖，缺失会导致 Crash。 |
| `@cfworker/json-schema` | `^4.1.1` | LangChain 内部使用的校验库，打包工具常漏掉。 |
| `semver` | `^7.7.3` | 版本检查工具，常被漏掉。 |
| `base64-js` | `^1.5.1` | `js-tiktoken` 的深层依赖。 |
| `js-tiktoken` | `^1.0.21` | Token 计算库。 |
| `yaml` | `^2.8.2` | YAML 解析。 |
| `js-yaml` | `^4.1.1` | 另一种 YAML 解析库。 |
| `zod` | `^4.3.5` | 数据验证库。 |

## 2. 打包配置 (package.json > build)

除了安装依赖，还必须在 `electron-builder` 的配置中做特殊处理，特别是针对 Native 模块 (`better-sqlite3`)。

```json
"build": {
  "asarUnpack": [
    "**/node_modules/better-sqlite3/**"
  ],
  "files": [
    "out/**/*",
    "package.json",
    "node_modules/better-sqlite3/**/*", 
    // ... 其他默认排除项
  ]
}
```

*   **`asarUnpack`**: 强制把 `better-sqlite3` 解压到 `app.asar` 外面，防止加载 `.node` 文件失败。
*   **`files`**: 显式包含 `node_modules/better-sqlite3`，防止被 Tree Shaking 误删。

## 3. 一键修复命令

如果您在新的项目中遇到类似问题，可以直接运行以下命令复刻当前环境：

```bash
# 1. 安装兼容版本的核心库
pnpm add better-sqlite3@11.8.1 uuid@9.0.1 p-queue@6.6.2 p-timeout@4.1.0 decamelize@5.0.0 ansi-styles@5.2.0 camelcase@6

# 2. 补全隐形依赖
pnpm add bindings file-uri-to-path openai langsmith @cfworker/json-schema semver base64-js js-tiktoken yaml js-yaml zod
```
