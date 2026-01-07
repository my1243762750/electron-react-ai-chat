# React Markdown 最佳实践指南 (ChatGPT 级渲染)

本文档记录了如何在 React 项目中实现类似 ChatGPT 的 Markdown 渲染效果，包括代码高亮、复制按钮、表格支持等。

## 1. 核心依赖 (Tech Stack)

| 库名 | 版本 (参考) | 作用 |
| :--- | :--- | :--- |
| **react-markdown** | ^9.0.0 | 核心库，将 Markdown 字符串转换为 React 组件树。 |
| **react-syntax-highlighter** | ^15.5.0 | 代码语法高亮，支持多种主题 (如 VS Code 深色)。 |
| **remark-gfm** | ^4.0.0 | 支持 GitHub Flavor Markdown (表格、删除线、自动链接)。 |
| **lucide-react** | ^0.300.0 | 图标库 (复制、对勾图标)。 |
| **clsx / tailwind-merge** | ^2.0.0 | 样式类名合并工具。 |

### 安装命令
```bash
pnpm add react-markdown react-syntax-highlighter remark-gfm lucide-react clsx tailwind-merge
```

## 2. 关键组件实现

### 2.1 增强型代码块 (CodeBlock)
封装一个带有顶部栏（显示语言 + 复制按钮）的代码块组件。

```jsx
import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy } from 'lucide-react'

const CodeBlock = ({ language, children }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg overflow-hidden my-4 border border-gray-700 bg-[#1e1e1e]">
      {/* 顶部栏 */}
      <div className="flex justify-between items-center px-4 py-1.5 bg-[#2d2d2d] border-b border-gray-700">
        <span className="text-xs text-gray-400 lowercase font-mono">{language || 'text'}</span>
        <button 
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      
      {/* 代码区域 */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
        wrapLongLines={true}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
```

### 2.2 Markdown 渲染入口 (MessageRenderer)
自定义 `react-markdown` 的 `components` 属性，接管 `code` 标签的渲染。

```jsx
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'

const MessageRenderer = ({ content }) => {
  return (
    // 使用 Tailwind 的 typography 插件 (prose) 自动排版
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <Markdown
        remarkPlugins={[remarkGfm]} // 启用表格等 GFM 特性
        components={{
          // 接管 code 标签
          code({node, inline, className, children, ...props}) {
            const match = /language-(\w+)/.exec(className || '')
            // 如果是块级代码 (有语言标识)，使用 CodeBlock
            return !inline && match ? (
              <CodeBlock language={match[1]}>
                {String(children).replace(/\n$/, '')}
              </CodeBlock>
            ) : (
              // 如果是行内代码 (如 `const a = 1`)，使用简单样式
              <code className={clsx("bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5 font-mono text-sm", className)} {...props}>
                {children}
              </code>
            )
          }
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
```

## 3. 样式配置 (Tailwind)

为了让 Markdown 内容（如标题、列表、引用）自动拥有漂亮的样式，推荐使用 `@tailwindcss/typography` 插件。

### 3.1 安装插件
```bash
pnpm add -D @tailwindcss/typography
```

### 3.2 配置 `tailwind.config.js`
```javascript
module.exports = {
  // ...
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
```

### 3.3 使用
只需在容器上添加 `prose` 类名即可：
```jsx
<div className="prose prose-sm dark:prose-invert">
  <Markdown>{content}</Markdown>
</div>
```
*   `prose`: 基础排版样式。
*   `prose-sm`: 调整字体大小（适合聊天气泡）。
*   `dark:prose-invert`: 深色模式下反转颜色（白字黑底）。

## 4. 常见坑点 (Troubleshooting)

1.  **代码块不换行**：
    *   在 `SyntaxHighlighter` 中设置 `wrapLongLines={true}`。
2.  **列表样式丢失**：
    *   确保外层容器有 `prose` 类名，或者手动编写 `ul/ol` 的 CSS。
3.  **流式输出时闪烁**：
    *   这是因为 Markdown 解析器在接收到不完整的字符时会重绘。通常无需特殊处理，React 的 Diff 算法会处理得足够快。
4.  **Math/Latex 公式**：
    *   需要额外安装 `rehype-katex` 和 `remark-math`，并引入 Katex 的 CSS 文件。

---
*Created by Trae AI Assistant*
