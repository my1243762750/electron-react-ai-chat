import React, { useState, useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import { Send, Square, Settings, MessageSquare, Plus, Trash2, Copy, Check, AlertCircle, Brain, Globe, Paperclip, Mic, ChevronRight, ChevronDown, Search, Link, X } from 'lucide-react'
import { create } from 'zustand'
import clsx from 'clsx'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import remarkGfm from 'remark-gfm'
import { Toaster, toast } from 'sonner'
import ErrorBoundary from './components/ErrorBoundary'

// --- Zustand Store for State Management ---
const useChatStore = create((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  isGenerating: false,
  isReasoningEnabled: false, // Default R1 disabled
  isWebSearchEnabled: false,
  
  setConversations: (list) => set({ conversations: list }),
  setReasoningEnabled: (enabled) => set({ isReasoningEnabled: enabled }),
  setWebSearchEnabled: (enabled) => set({ isWebSearchEnabled: enabled }),
  
  setCurrentConversation: async (id) => {
    // 1. Switch ID
    set({ currentConversationId: id, messages: [] })
    // 2. Load History
    const msgs = await window.api.loadHistory(id)
    set({ messages: msgs })
  },

  addMessage: (role, content, isLoading = false, status = 'sent', attachments = []) => set(state => ({ 
    messages: [...state.messages, { role, content, reasoningContent: '', isLoading, status, attachments, id: Date.now() + Math.random().toString(36).slice(2) }] 
  })),
  
  updateLastMessage: (chunk) => set(state => {
    const msgs = [...state.messages]
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1]
      lastMsg.content += chunk
      // Only stop loading if we have content (prevents flickering)
      if (lastMsg.content.trim().length > 0) {
        lastMsg.isLoading = false
      }
      lastMsg.status = 'sent'
    }
    return { messages: msgs }
  }),

  updateLastMessageReasoning: (chunk) => set(state => {
    const msgs = [...state.messages]
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1]
      lastMsg.reasoningContent = (lastMsg.reasoningContent || '') + chunk
      // Thinking implies loading is still true, but content might be empty
    }
    return { messages: msgs }
  }),

  updateLastMessageSearch: (statusData) => set(state => {
    const msgs = [...state.messages]
    if (msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1]
      // Merge search status
      lastMsg.searchStatus = statusData.status
      if (statusData.results) {
        lastMsg.searchResults = statusData.results
      }
    }
    return { messages: msgs }
  }),

  setGenerating: (status) => set({ isGenerating: status }),
  
  markLastMessageError: () => set(state => {
    const msgs = [...state.messages]
    if (msgs.length > 0) {
      msgs[msgs.length - 1].status = 'error'
      msgs[msgs.length - 1].isLoading = false
    }
    return { messages: msgs }
  }),
  
  clearMessages: () => set({ messages: [] })
}))

// --- UI Components ---

// Code Block Component with Copy Button
const CodeBlock = ({ language, children }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg overflow-hidden my-4 border border-gray-700 bg-[#1e1e1e]">
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

const LoadingDots = () => (
  <div className="flex w-full mb-6 justify-start">
    <div className="flex space-x-1.5 h-6 items-center px-4 py-3">
      <div className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2.5 h-2.5 bg-gray-600 dark:bg-gray-400 rounded-full animate-bounce"></div>
    </div>
  </div>
)

const MessageBubble = ({ role, content, reasoningContent, searchStatus, searchResults, isLoading, status, attachments }) => {
  const isUser = role === 'user'
  
  // Use a stricter check: if it's AI and has no content, force thinking state
  const isThinking = !isUser && (!content || content.trim().length === 0) && !reasoningContent && searchStatus !== 'searching' && searchStatus !== 'done'
  
  if (isThinking) {
    return <LoadingDots />
  }

  return (
    <div className={clsx("flex w-full mb-6", isUser ? "justify-end" : "justify-start")}>
      <div className={clsx(
        "max-w-[85%] rounded-2xl px-4 py-3 shadow-sm relative group",
        isUser 
          ? "bg-blue-600 text-white" 
          : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 w-full",
        status === 'error' && "border-red-500 dark:border-red-500"
      )}>
        {status === 'error' && (
           <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-red-500" title="Sending failed">
             <AlertCircle size={20} />
           </div>
        )}
        
        {/* Render Attachments (Images) if any */}
        {attachments && attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative rounded-lg overflow-hidden border border-white/20 shadow-sm max-w-sm">
                <img src={att.content} alt="Attachment" className="max-h-64 w-auto object-cover block" />
              </div>
            ))}
          </div>
        )}

        {isUser ? (
          <div className="whitespace-pre-wrap">{content}</div>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {/* Search Status UI */}
            {searchStatus && (
              <div className="mb-4">
                {searchStatus === 'searching' && (
                  <div className="flex items-center gap-2 text-blue-500 animate-pulse">
                    <Search size={14} className="animate-spin" />
                    <span className="text-xs font-medium">正在联网搜索...</span>
                  </div>
                )}
                
                {searchStatus === 'done' && searchResults && (
                  <details className="group/search">
                    <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-500 transition-colors select-none p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800/50 w-fit">
                       <div className="flex items-center gap-1.5">
                         <Search size={14} className="text-blue-500" />
                         <span>已阅读 {searchResults.length} 个网页</span>
                       </div>
                       <ChevronDown size={14} className="group-open/search:rotate-180 transition-transform" />
                    </summary>
                    
                    <div className="mt-2 pl-2 space-y-2">
                      {searchResults.map((result, idx) => (
                         <div key={idx} className="flex items-start gap-2 text-xs bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700/50">
                           <div className="mt-0.5 min-w-[16px] flex justify-center">
                             {/* Try to use favicon if URL exists, else generic icon */}
                             {result.metadata?.source || result.metadata?.url ? (
                               <img 
                                 src={`https://www.google.com/s2/favicons?domain=${new URL(result.metadata.source || result.metadata.url).hostname}`}
                                 alt="icon"
                                 className="w-4 h-4 opacity-70"
                                 onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='block' }}
                               />
                             ) : null}
                             <Link size={14} className="text-gray-400" style={{ display: (result.metadata?.source || result.metadata?.url) ? 'none' : 'block' }} />
                           </div>
                           <div className="flex-1 min-w-0">
                             <a 
                               href={result.metadata?.source || result.metadata?.url} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="font-medium text-blue-600 dark:text-blue-400 hover:underline truncate block"
                             >
                               {result.metadata?.title || 'Untitled Page'}
                             </a>
                             <div className="text-gray-500 dark:text-gray-400 truncate mt-0.5 opacity-80">
                               {result.pageContent?.slice(0, 100).replace(/\n/g, ' ')}...
                             </div>
                           </div>
                         </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Reasoning Content (Deep Thinking) */}
            {reasoningContent && (
              <details className="mb-4 group/details" open>
                <summary className="cursor-pointer list-none text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1 hover:text-blue-500 transition-colors select-none">
                  <span className="group-open/details:hidden">▶ 显示思考过程</span>
                  <span className="hidden group-open/details:inline">▼ 隐藏思考过程</span>
                </summary>
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 text-xs font-mono whitespace-pre-wrap leading-relaxed">
                  {reasoningContent}
                </div>
              </details>
            )}

            <Markdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({node, inline, className, children, ...props}) {
                  const match = /language-(\w+)/.exec(className || '')
                  return !inline && match ? (
                    <CodeBlock language={match[1]}>
                      {String(children).replace(/\n$/, '')}
                    </CodeBlock>
                  ) : (
                    <code className={clsx("bg-gray-100 dark:bg-gray-700 rounded px-1 py-0.5", className)} {...props}>
                      {children}
                    </code>
                  )
                },
                // Custom image renderer to handle Base64 properly
                img({node, src, alt, ...props}) {
                  // Check if it's a valid image source (base64 or url)
                  if (!src) return null
                  return (
                    <div className="my-2 max-w-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
                      <img src={src} alt={alt || 'User uploaded image'} {...props} className="w-full h-auto block" />
                    </div>
                  )
                },
                // Fallback for paragraph to prevent breaking layout
                p({children}) {
                  // Only wrap in div if it contains block elements (like images potentially), otherwise keep p behavior
                  return <div className="mb-2 last:mb-0 leading-relaxed">{children}</div>
                }
              }}
            >
              {content}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [attachments, setAttachments] = useState([])
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  
  const { 
    conversations, currentConversationId, messages, isGenerating, isReasoningEnabled, isWebSearchEnabled,
    setConversations, setCurrentConversation, addMessage, updateLastMessage, updateLastMessageReasoning, updateLastMessageSearch, setGenerating, markLastMessageError, setReasoningEnabled, setWebSearchEnabled
  } = useChatStore()

  // --- Effects ---
  
  // 1. Initial Load
  useEffect(() => {
    // Check Keys
    window.api.getKeysStatus().then(({ hasDeepSeek, hasTavily }) => {
      // Logic to prompt user if keys missing
    })

    // Load Conversations
    loadConversations()

    // Stream Listeners
    const removeChunkListener = window.api.onStreamChunk(updateLastMessage)
    const removeReasoningListener = window.api.onStreamReasoning(updateLastMessageReasoning)
    const removeSearchListener = window.api.onSearchUpdate(updateLastMessageSearch)
    const removeEndListener = window.api.onStreamEnd(() => setGenerating(false))
    const removeTitleListener = window.api.onTitleUpdated(() => {
      loadConversations() // Auto refresh when AI generates a title
    })
    
    // Chat Created Listener (Lazy Creation Success)
    const removeCreatedListener = window.api.onChatCreated((newId) => {
       useChatStore.setState({ currentConversationId: newId })
       loadConversations()
    })

    // Error Listener
    const removeErrorListener = window.api.onAppError((msg) => {
      toast.error(msg)
      setGenerating(false)
      markLastMessageError()
    })

    return () => {
      removeChunkListener()
      removeReasoningListener()
      removeSearchListener()
      removeEndListener()
      removeTitleListener()
      removeErrorListener()
      removeCreatedListener()
    }
  }, [])

  // 2. Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // --- Actions ---

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          setAttachments(prev => [...prev, { type: 'image', content: e.target.result }])
        }
        reader.readAsDataURL(file)
      }
    })
    // Reset input
    e.target.value = ''
  }

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const loadConversations = async () => {
    const list = await window.api.getConversations()
    setConversations(list)
    
    // Auto-select first conversation
    if (list.length > 0 && !useChatStore.getState().currentConversationId) {
      setCurrentConversation(list[0].id)
    } 
    // If empty, do nothing (wait for user to create via first message or click New Chat)
  }

  const handleNewChat = async () => {
    // Lazy creation: Don't create in DB yet
    // Just clear current ID and messages
    useChatStore.setState({ currentConversationId: null, messages: [] })
  }

  const handleDeleteChat = async (id, e) => {
    e.stopPropagation()
    if (confirm('Delete this chat?')) {
      await window.api.deleteConversation(id)
      
      const list = await window.api.getConversations()
      setConversations(list)
      
      if (id === currentConversationId) {
        if (list.length > 0) {
          setCurrentConversation(list[0].id)
        } else {
          handleNewChat()
        }
      }
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isGenerating) return
    // 1. Pre-check Network
    if (!navigator.onLine) {
      toast.error('⚠️ Network disconnected. Please check your connection.')
      return
    }

    const userMsg = input
    setInput('')
    const currentAttachments = [...attachments]
    setAttachments([])
    
    // Display in UI: Append images if any
    // let displayContent = ""
    // if (currentAttachments.length > 0) {
    //    currentAttachments.forEach(att => {
    //      // Use standard Markdown image syntax: ![Image](data:image/...)
    //      // IMPORTANT: No space between ] and (
    //      displayContent += `![Image](${att.content})\n\n`
    //    })
    // }
    // displayContent += userMsg

    addMessage('user', userMsg, false, 'sent', currentAttachments)
    addMessage('assistant', '')
    setGenerating(true)
    
    let conversationId = currentConversationId

    // Lazy Creation: Create conversation now if it doesn't exist
    if (!conversationId) {
      conversationId = await window.api.createConversation('New Chat')
      // Update store and sidebar silently
      useChatStore.setState({ currentConversationId: conversationId })
      // Don't await loadConversations to keep UI snappy, let it happen in background
      loadConversations()
    }

    // Send with valid conversationId
    window.api.sendMessage(userMsg, conversationId, isReasoningEnabled, isWebSearchEnabled, currentAttachments)
  }

  // ... (Other handlers like handleStop, handleSaveKey, handleKeyDown remain same) ...
  const handleStop = () => {
    window.api.stopGeneration()
    setGenerating(false)
  }

  const handleSaveKey = async () => {
    if (apiKey.trim()) {
      await window.api.saveApiKey(apiKey, 'api_key')
    }
    if (tavilyKey.trim()) {
      await window.api.saveApiKey(tavilyKey, 'tavily_key')
    }
    setShowSettings(false)
    alert('Keys saved securely!')
  }

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 font-sans overflow-hidden">
      <Toaster richColors position="top-center" />
      
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-gray-100 dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <h1 className="font-bold text-lg text-gray-700 dark:text-gray-200">AI 助手</h1>
          <button onClick={() => setShowSettings(!showSettings)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-md">
            <Settings size={18} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          <button 
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 hover:border-blue-500 transition-colors text-left"
          >
            <Plus size={16} className="text-blue-500" />
            <span className="text-sm font-medium">新对话</span>
          </button>
          
          <div className="text-xs font-semibold text-gray-400 mt-4 mb-2 px-2 uppercase tracking-wider">最近对话</div>
          
          {conversations.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setCurrentConversation(chat.id)}
              className={clsx(
                "group w-full flex items-center justify-between gap-2 p-2 rounded-md cursor-pointer text-sm transition-colors",
                currentConversationId === chat.id 
                  ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white" 
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800"
              )}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <MessageSquare size={16} className="flex-shrink-0" />
                <span className="truncate">{chat.title || 'Untitled Chat'}</span>
              </div>
              <button 
                onClick={(e) => handleDeleteChat(chat.id, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* ... (Settings Modal, Messages List, Input Area remain same) ... */}
        {showSettings && (
          <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-2xl w-96 border border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-bold mb-4">设置</h2>
              <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-300">DeepSeek API Key</label>
              <input 
                type="password" 
                className="w-full p-2 border rounded-lg mb-4 bg-gray-50 dark:bg-gray-900 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="sk-..."
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />

              <label className="block text-sm font-medium mb-2 text-gray-600 dark:text-gray-300">Tavily Search API Key</label>
              <input 
                type="password" 
                className="w-full p-2 border rounded-lg mb-4 bg-gray-50 dark:bg-gray-900 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="tvly-..."
                value={tavilyKey}
                onChange={e => setTavilyKey(e.target.value)}
              />
              
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
                <button onClick={handleSaveKey} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">保存</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <div className="w-16 h-16 bg-gray-200 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                <span className="text-3xl">🤖</span>
              </div>
              <p className="text-lg font-medium">今天有什么可以帮您的？</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} role={msg.role} content={msg.content} reasoningContent={msg.reasoningContent} searchStatus={msg.searchStatus} searchResults={msg.searchResults} isLoading={msg.isLoading} attachments={msg.attachments} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800">
          <div className="max-w-3xl mx-auto">
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />
            
            <div className="relative rounded-3xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/50 transition-all p-3">
              {attachments.length > 0 && (
                <div className="px-1 pb-2 flex gap-2 overflow-x-auto pt-2">
                  {attachments.map((att, i) => (
                    <div key={i} className="relative group w-12 h-12 flex-shrink-0">
                      <img src={att.content} className="w-full h-full object-cover rounded-lg border border-gray-200 dark:border-gray-700" />
                      <button 
                        onClick={() => removeAttachment(i)}
                        className="absolute -top-1.5 -right-1.5 bg-gray-500 hover:bg-red-500 text-white rounded-full p-0.5 shadow-md transition-all z-10 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                className="w-full p-2 bg-transparent outline-none resize-none min-h-[48px] max-h-48 text-gray-700 dark:text-gray-200 placeholder-gray-400 text-base"
                placeholder="给 AI 发送消息..."
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              
              <div className="flex justify-between items-center mt-2 pt-2">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" 
                    title="Attach image"
                  >
                    <Paperclip size={18} />
                  </button>
                  
                  <button 
                    onClick={() => setReasoningEnabled(!isReasoningEnabled)}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                      isReasoningEnabled 
                        ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" 
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                    )}
                  >
                    <Brain size={14} />
                    <span>深度思考</span>
                  </button>

                  <button 
                    onClick={() => setWebSearchEnabled(!isWebSearchEnabled)}
                    className={clsx(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                      isWebSearchEnabled 
                        ? "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800" 
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                    )}
                  >
                    <Globe size={14} />
                    <span>联网搜索</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {isGenerating ? (
                    <button 
                      onClick={handleStop}
                      className="p-2 bg-gray-800 dark:bg-white text-white dark:text-black rounded-full hover:opacity-80 transition-opacity"
                      title="停止生成"
                    >
                      <Square size={16} fill="currentColor" />
                    </button>
                  ) : (
                    <button 
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      <Send size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            <div className="text-center text-xs text-gray-400 mt-3">
              AI 可能会犯错，请核对重要信息。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  )
}
