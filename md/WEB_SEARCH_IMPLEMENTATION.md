# 联网搜索功能实现原理解析

本文档详细讲解了本项目中基于 LangChain 实现联网搜索增强生成（RAG）的核心代码逻辑。

## 核心代码文件

*   **文件路径**: `src/main/services/langchainService.js`
*   **主要依赖**:
    *   `@langchain/community`: 提供 Tavily 搜索集成。
    *   `@langchain/openai`: 提供兼容 OpenAI 接口的模型调用（用于 DeepSeek）。
    *   `@langchain/core`: 核心消息和数据结构。

## 实现思路概览

整个联网搜索流程可以分为两个主要阶段：**检索（Retrieval）** 和 **生成（Generation）**。

1.  **检索阶段**: 使用 Tavily API 搜索用户的问题，获取相关的网页内容片段。
2.  **上下文构建**: 将搜索到的内容整理成结构化的文本（Context）。
3.  **生成阶段**: 将用户的原始问题 + 搜索到的上下文一同发送给 DeepSeek 模型，让模型基于搜索结果回答问题。

## 详细代码解析

### 1. 引入依赖

由于 `@langchain/community` 的某些版本导出问题，我们使用 `TavilySearchAPIRetriever` 替代了 `TavilySearchResults` 工具，这提供了更稳定的文档检索能力。

```javascript
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearchAPIRetriever } from "@langchain/community/retrievers/tavily_search_api";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
```

### 2. 主函数逻辑 `runWebSearchChain`

这是暴露给主进程调用的核心函数，接收用户问题和 API Key。

```javascript
export async function runWebSearchChain(prompt, apiKey, tavilyKey, onToken) {
  // 校验 API Key
  if (!tavilyKey) {
    throw new Error("Tavily API Key is missing...");
  }

  // ... 后续逻辑
}
```

### 3. 第一步：执行联网搜索 (Retrieval)

这里初始化了 `TavilySearchAPIRetriever`。Tavily 是专为 LLM 设计的搜索引擎，它返回的不是一堆 HTML，而是提取好的、干净的文本片段。

```javascript
// 初始化检索器
const retriever = new TavilySearchAPIRetriever({
  apiKey: tavilyKey,
  k: 5, // 获取前 5 个最相关的搜索结果
});

// 通知前端正在搜索
onToken("[Status: Searching the web...]\n\n");

// 执行搜索，获取文档列表 (Documents)
const documents = await retriever.invoke(prompt);
```

### 4. 第二步：构建上下文 (Context Construction)

模型无法直接“读取”文档对象，我们需要将搜索结果拼接成一个字符串，作为提示词的一部分。

```javascript
let context = "";
if (documents && documents.length > 0) {
  // 遍历搜索结果，提取 来源(URL)、标题(Title) 和 内容(Content)
  context = documents.map((doc, i) => `
Source ${i + 1}: ${doc.metadata.source || doc.metadata.url || 'Unknown URL'}
Title: ${doc.metadata.title || 'Untitled'}
Content: ${doc.pageContent}
`).join("\n---\n");
} else {
  context = "No relevant search results found.";
}

// 通知前端搜索完成，准备生成
onToken(`[Status: Found ${context.length} chars of context. Generating answer...]\n\n`);
```

### 5. 第三步：LLM 生成回答 (Generation)

这一步配置 DeepSeek 模型（通过 `ChatOpenAI` 适配器），并构造包含搜索结果的 System Prompt。

```javascript
// 初始化模型配置
const model = new ChatOpenAI({
  modelName: "deepseek-v3-2-251201", 
  openAIApiKey: apiKey,
  configuration: {
    baseURL: "https://ark.cn-beijing.volces.com/api/v3", // 火山引擎接入点
  },
  temperature: 0.3, // 联网问答通常需要较低的温度以保证准确性
  streaming: true,  // 开启流式输出
});

// 构造系统提示词，注入搜索到的上下文
const systemPrompt = `You are a helpful AI assistant with access to real-time web search results.
User's question: ${prompt}

Here are the search results from the web:
${context}

Please answer the user's question comprehensively based on the search results above.
If the search results don't contain the answer, say so.
Cite your sources using [Source X] format.`;

// 发起流式请求
const stream = await model.stream([
  new SystemMessage(systemPrompt),
  new HumanMessage(prompt),
]);
```

### 6. 流式响应处理

最后，遍历模型返回的数据流，通过 `onToken` 回调实时推送到前端。

```javascript
let fullResponse = "";
for await (const chunk of stream) {
  const content = chunk.content;
  if (content) {
    fullResponse += content;
    onToken(content); // 实时发送给前端渲染
  }
}
return fullResponse;
```

## 总结

这个实现是一个典型的 **RAG (Retrieval-Augmented Generation)** 架构的简化版：

1.  **Query**: 用户输入。
2.  **Retrieve**: Tavily 搜索相关信息。
3.  **Augment**: 将搜索信息拼接到 Prompt 中。
4.  **Generate**: LLM 生成最终带引用的回答。
