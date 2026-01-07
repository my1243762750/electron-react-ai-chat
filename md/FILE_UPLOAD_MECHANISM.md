# AI 助手附件处理与多模态实现原理

目前主流的 AI 产品（如 ChatGPT, Gemini, DeepSeek, 豆包等）在处理附件时，通常采用 **"前端识别 + 后端分流处理"** 的策略。系统会根据文件类型（MIME Type）将任务分发给不同的处理管线。

## 1. 前端识别：AI 怎么知道我传的是图片还是文档？

当你在输入框上传文件时，前端（React/Electron）会首先获取文件对象（File Object）。

*   **文件类型检测**: 通过 `file.type` (MIME type) 或文件后缀名判断。
    *   `image/*` (jpg, png, webp) -> **视觉处理管线**
    *   `application/pdf`, `text/*`, `.docx` -> **文档阅读管线**
    *   `.csv`, `.xlsx` -> **数据分析管线 (Code Interpreter)**

## 2. 后端处理：核心技术路线

根据识别到的文件类型，系统会采取完全不同的处理方式提交给 AI 模型。

### A. 图片处理 (Vision / 多模态)

现代大模型（如 GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro）大多是**原生多模态（Native Multimodal）**的，这意味着它们不需要将图片转成文字，而是能直接“看”懂图片的像素信息。

*   **流程**:
    1.  **编码**: 前端将图片转换为 Base64 字符串或上传到云存储获取 URL。
    2.  **构造 Payload**: 将图片数据作为消息的一部分发送给 API。
    
    ```json
    // 典型的多模态 API 请求结构
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "这张图里有什么？" },
        { 
          "type": "image_url", 
          "image_url": { "url": "data:image/jpeg;base64,..." } 
        }
      ]
    }
    ```
*   **DeepSeek 的情况**: DeepSeek V3 主要是强大的文本/推理模型。如果需要处理图片，通常需要使用其专门的 **DeepSeek-VL (Vision-Language)** 模型，或者在应用层引入一个轻量级的视觉模型（如 LLaVA 或 GPT-4o-mini）先对图片进行描述（Image Captioning），再将描述文字传给 DeepSeek V3。

### B. 文档处理 (RAG / Context Injection)

对于 PDF、Word、TXT 等文档，AI 本质上是无法直接读取二进制文件的。必须先**提取文本**。

*   **小文档 (直接放入上下文)**:
    1.  **解析**: 后端使用工具库（如 `pdf-parse`, `mammoth` (docx), `textract`）提取纯文本。
    2.  **注入**: 将提取的文本直接拼接到 Prompt 中。
        ```text
        System: 你是一个文档助手。
        User: 请总结以下文件内容：
        [文件开始]
        ...这里是解析出来的几千字文本...
        [文件结束]
        ```

*   **大文档 (RAG - 检索增强生成)**:
    如果文档几百页，超过了模型的上下文窗口（Context Window）：
    1.  **切片 (Chunking)**: 将文本切成 500-1000 字的小块。
    2.  **向量化 (Embedding)**: 将小块存入向量数据库（Vector DB）。
    3.  **检索**: 用户提问时，先搜索最相关的几个片段。
    4.  **生成**: 将相关片段喂给 AI 回答。

*   **我们的项目实现**:
    目前你的项目中引入了 `@langchain/community`，它非常擅长这个工作。它有很多 `DocumentLoaders` 可以轻松加载 PDF 和 Word 并转为文本。

### C. 数据分析 (Code Interpreter)

对于 Excel (`.xlsx`) 或 CSV 文件，ChatGPT 等高级助手不会直接读文本，而是：
1.  **上传**: 将文件上传到云端沙箱环境。
2.  **编程**: AI 编写 Python 代码（使用 `pandas` 库）来读取和分析文件。
3.  **执行**: 运行代码并获得结果（图表或统计数据）。

## 3. 在本项目中如何实现？

基于我们目前的架构 (Electron + LangChain + DeepSeek V3)，我们可以实现 **文档阅读功能**：

1.  **UI 层**: 点击回形针 -> 选择文件 -> 判断是 PDF/TXT/MD。
2.  **主进程**:
    *   接收文件路径。
    *   使用 `LangChain` 的加载器（如 `PDFLoader`, `TextLoader`）读取文本。
    *   如果文本较短 -> 直接附加到 `messages`。
    *   如果文本较长 -> 提示用户或截取摘要。
3.  **发送给 DeepSeek**: 作为一个包含文件内容的 Prompt 发送。

对于**图片功能**，由于 DeepSeek V3 API 标准接口主要针对文本，如果要支持图片，我们可能需要：
*   接入兼容 OpenAI Vision 协议的其他模型（如 gpt-4o-mini）专门处理图片。
*   或者等待/寻找 DeepSeek 的多模态 API 接口。
