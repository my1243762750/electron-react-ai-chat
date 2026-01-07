import { ChatOpenAI } from "@langchain/openai";
import { TavilySearchAPIRetriever } from "@langchain/community/retrievers/tavily_search_api";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

/**
 * Perform a web search enhanced chat generation
 * @param {string} prompt - User's question
 * @param {string} apiKey - DeepSeek API Key
 * @param {string} tavilyKey - Tavily API Key (for search)
 * @param {function} onToken - Callback for streaming tokens
 * @param {function} onStatus - Callback for search status updates
 * @returns {Promise<string>} - Final response
 */
export async function runWebSearchChain(prompt, apiKey, tavilyKey, onToken, onStatus) {
  try {
    if (!tavilyKey) {
      throw new Error("Tavily API Key is missing. Please set it in Settings.");
    }

    // 1. Search Web
    // Use Tavily Retriever since Tool export is missing in this version
    const retriever = new TavilySearchAPIRetriever({
      apiKey: tavilyKey,
      k: 5,
    });

    console.log("Searching Tavily with prompt:", prompt);
    console.log("Tavily API Key:", tavilyKey);
    console.log("DeepSeek API Key (Masked):", apiKey ? apiKey.slice(0, 5) + "..." : "MISSING");
    console.log("Retriever Config:", retriever);

    // Notify: Searching
    if (onStatus) onStatus({ status: 'searching' });
    
    // Execute search
    const documents = await retriever.invoke(prompt);
    
    // Notify: Results found
    if (onStatus) onStatus({ status: 'done', results: documents });
    
    // Parse results
    let context = "";
    if (documents && documents.length > 0) {
      context = documents.map((doc, i) => `
Source ${i + 1}: ${doc.metadata.source || doc.metadata.url || 'Unknown URL'}
Title: ${doc.metadata.title || 'Untitled'}
Content: ${doc.pageContent}
`).join("\n---\n");
    } else {
      context = "No relevant search results found.";
    }

    if (!apiKey) {
      throw new Error("DeepSeek API Key is missing. Please check your settings.");
    }

    // 2. Generate Answer with DeepSeek
    const cleanApiKey = apiKey.trim();
    const model = new ChatOpenAI({
      modelName: "deepseek-v3-2-251201",
      openAIApiKey: cleanApiKey,
      apiKey: cleanApiKey, // Redundant alias just in case
      configuration: {
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        apiKey: cleanApiKey, // Pass directly to OpenAI Client options
      },
      temperature: 0.3,
      streaming: true,
    });

    const systemPrompt = `You are a helpful AI assistant with access to real-time web search results.
User's question: ${prompt}

Here are the search results from the web:
${context}

Please answer the user's question comprehensively based on the search results above.
If the search results don't contain the answer, say so, but try to answer from your own knowledge if possible.
Cite your sources using [Source X] format if you use information from them.`;

    const stream = await model.stream([
      new SystemMessage(systemPrompt),
      new HumanMessage(prompt),
    ]);

    let fullResponse = "";
    for await (const chunk of stream) {
      const content = chunk.content;
      if (content) {
        fullResponse += content;
        onToken(content);
      }
    }

    return fullResponse;

  } catch (error) {
    console.error("LangChain Service Error:", error);
    onToken(`\n\n[Error: ${error.message}]`);
    throw error;
  }
}
