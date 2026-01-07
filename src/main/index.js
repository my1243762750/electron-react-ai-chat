import { app, shell, BrowserWindow, ipcMain, safeStorage, net, dialog } from 'electron'
import { runWebSearchChain } from './services/langchainService'
import { callVisionModel } from './services/visionService'
import { setupUpdateHandlers, checkForUpdates } from './services/updateService'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// import icon from '../../resources/icon.png?asset'
import Database from 'better-sqlite3'

// --- 1. Database Setup (Mocking for MVP) ---
// In a real app, use app.getPath('userData')
// For dev convenience, we might store it in the project root or userData
const dbPath = join(app.getPath('userData'), 'ai-assistant-mvp.db')
console.log('Database Path:', dbPath)

let db
try {
  db = new Database(dbPath)
  // Init tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      role TEXT, -- 'user' or 'assistant'
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)
} catch (err) {
  console.error('Failed to init database:', err)
  // Wait for app to be ready to show error dialog, or use setTimeout if app is already ready (unlikely at top level)
  // Better to handle this inside app.whenReady or send to renderer later.
  // We will store the error to show it later.
  global.dbError = err
}

// --- 2. Mock SafeStorage ---
// If safeStorage is not available (e.g. Linux without gnome-keyring or Dev mode issues), fallback to simple encoding
const mockSafeStorage = {
  isEncryptionAvailable: () => {
     return safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()
  },
  encryptString: (text) => {
    if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(text)
    }
    return Buffer.from(text) // Fallback: plain buffer
  },
  decryptString: (buffer) => {
    if (safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer)
    }
    return buffer.toString() // Fallback
  }
}

// --- 3. Real DeepSeek API Logic (Stream) ---
let currentRequest = null // To support cancellation

function generateTitle(message, apiKey) {
  const request = net.request({
    method: 'POST',
    url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  })

  const payload = JSON.stringify({
    model: 'deepseek-v3-2-251201',
    messages: [
      { role: 'system', content: 'Summarize the user message into a short title (within 10 words). Do not contain punctuation marks.' },
      { role: 'user', content: message }
    ],
    stream: false // Non-streaming for title generation
  })

  request.write(payload)

  return new Promise((resolve) => {
    request.on('response', (response) => {
      let buffer = ''
      response.on('data', (chunk) => buffer += chunk)
      response.on('end', () => {
        try {
          const json = JSON.parse(buffer)
          resolve(json.choices[0]?.message?.content?.trim() || null)
        } catch (e) {
          resolve(null)
        }
      })
    })
    request.on('error', () => resolve(null))
    request.end()
  })
}

function callDeepSeek(prompt, sender, conversationId, isReasoning = false) {
  // 1. Get API Key from DB
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key')
  if (!row) {
    sender.send('app:error', '⚠️ API Key not found. Please set it in Settings.')
    sender.send('chat:stream-end')
    return
  }

  const apiKey = mockSafeStorage.decryptString(row.value)
  
  // 2. Load Context (History)
  let history = []
  if (conversationId) {
    history = db.prepare(`
      SELECT role, content 
      FROM messages 
      WHERE conversation_id = ? 
      ORDER BY id DESC 
      LIMIT 20
    `).all(conversationId).reverse()
  }

  // 3. Prepare Request
  const request = net.request({
    method: 'POST',
    url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', // Revert to standard endpoint
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    }
  })

  currentRequest = request

  // Construct messages with history
  const messages = [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: 'user', content: prompt } // Add current message manually
  ]

  const payload = {
    model: 'deepseek-v3-2-251201', 
    messages: messages,
    stream: true
  }

  // Inject Reasoning Parameters if enabled
  if (isReasoning) {
    payload.thinking = { type: 'enabled' }
    payload.reasoning_effort = 'high'
    payload.temperature = 0.6 // Recommended low temp for reasoning
    payload.max_tokens = 4096 // Increase token limit for chain of thought
  }

  request.write(JSON.stringify(payload))

  // --- Optimization: Throttling & Persistence ---
  let fullContent = '' // Store complete response for DB
  let streamBuffer = '' // Buffer for throttling
  let lastSendTime = 0
  let isFirstChunk = true // To track first response for Lazy Creation

  // Timeout Protection (15s)
  const timeoutId = setTimeout(() => {
    if (currentRequest) {
      currentRequest.abort()
      sender.send('app:error', '⚠️ Connection Timeout (15s). Please check your network.')
      sender.send('chat:stream-end')
    }
  }, 15000)

  request.on('response', (response) => {
    clearTimeout(timeoutId) // Clear timeout on response

    if (response.statusCode !== 200) {
      // Read error body for details
      let errorBody = ''
      response.on('data', chunk => errorBody += chunk)
      response.on('end', () => {
        console.error('[API Error Body]', errorBody)
        sender.send('app:error', `⚠️ API Error ${response.statusCode}: ${errorBody.slice(0, 100)}`)
        sender.send('chat:stream-end')
      })
      return
    }

    response.on('data', (chunk) => {
      // Lazy Creation Logic: If response is valid and conversationId is null, create it now!
      if (isFirstChunk) {
        isFirstChunk = false
        if (!conversationId) {
          try {
             // 1. Create Conversation
             const result = db.prepare('INSERT INTO conversations (title) VALUES (?)').run('New Chat')
             conversationId = result.lastInsertRowid
             
             // 2. Insert User Message (Delayed)
             db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', prompt)
             
             // 3. Notify Frontend
             sender.send('chat:created', conversationId)

             // 4. Trigger Auto-Rename
             // Only if content is text. If mostly image, maybe skip or use vision title?
             // For now, only generate title if text length > 0
             if (message && message.trim().length > 0) {
                 generateTitle(message, apiKey).then(newTitle => {
                   if (newTitle) {
                     db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(newTitle, conversationId)
                     event.sender.send('chat:title-updated')
                   }
                 })
             }
          } catch (e) {
             console.error('Failed to lazy create conversation:', e)
          }
        }
      }

      const lines = chunk.toString().split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            return
          }
          try {
            const json = JSON.parse(data)
            const delta = json.choices[0]?.delta || {}

            // 1. Handle Reasoning (R1)
            if (delta.reasoning_content) {
              sender.send('chat:stream-reasoning', delta.reasoning_content)
            }

            // 2. Handle Content (V3/R1 Final Answer)
            const content = delta.content || ''
            if (content) {
              fullContent += content
              streamBuffer += content
              
              const now = Date.now()
              if (now - lastSendTime > 50) {
                sender.send('chat:stream-chunk', streamBuffer)
                streamBuffer = ''
                lastSendTime = now
              }
            }
          } catch (e) { }
        }
      }
    })

    response.on('end', () => {
      if (streamBuffer) {
        sender.send('chat:stream-chunk', streamBuffer)
      }
      sender.send('chat:stream-end')

      if (fullContent && conversationId) {
        try {
          db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'assistant', fullContent)
        } catch (err) {
          console.error('[DB] Failed to save AI response:', err)
        }
      }
    })
  })

  request.on('error', (error) => {
    clearTimeout(timeoutId)
    const errorMap = {
      'net::ERR_INTERNET_DISCONNECTED': '⚠️ Network disconnected. Please check your connection.',
      'net::ERR_TIMED_OUT': '⚠️ Connection timed out.',
      'net::ERR_CONNECTION_REFUSED': '⚠️ Connection refused by server.',
      'net::ERR_NAME_NOT_RESOLVED': '⚠️ DNS Error: Could not resolve hostname.'
    }
    const userMessage = errorMap[error.message] || `⚠️ Network Error: ${error.message}`
    
    sender.send('app:error', userMessage)
    sender.send('chat:stream-end')
  })

  request.end()
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    // ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // Initialize auto-updater
    setupUpdateHandlers(mainWindow)
    if (!is.dev) {
      checkForUpdates()
    }
  })

  // --- 重定向渲染进程日志到主进程终端 ---
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    console.log(`[Renderer ${levels[level] || 'INFO'}]: ${message}`)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (global.dbError) {
    dialog.showErrorBox('Database Initialization Failed', `Please reinstall the app.\n\nError: ${global.dbError.message}\nStack: ${global.dbError.stack}`)
  }

  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- IPC Handlers ---

  // 1. Send Message (Start Stream)
  ipcMain.on('chat:send', async (event, { message, conversationId, isReasoning, isWebSearch, attachments }) => {
    console.log('[IPC] Received:', message, 'CID:', conversationId, 'R1:', isReasoning, 'Web:', isWebSearch, 'Attachments:', attachments ? attachments.length : 0)
    
    if (currentRequest) {
      currentRequest.abort()
      currentRequest = null
    }

    if (conversationId) {
      // Existing conversation: Save immediately
      // If attachments exist, append a marker to content for DB (since we don't store blobs)
      let dbContent = message
      if (attachments && attachments.length > 0) {
        dbContent += `\n\n[Attached ${attachments.length} image(s)]`
      }
      db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', dbContent)
    } else {
      // New conversation: Don't save yet! Wait for API success.
      console.log('[IPC] New conversation, deferring DB insert...')
    }

    // --- Vision Model Logic ---
    if (attachments && attachments.length > 0) {
       const apiKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key')
       if (!apiKeyRow) {
         event.sender.send('app:error', '⚠️ API Key not found. Please set it in Settings.')
         event.sender.send('chat:stream-end')
         return
       }
       const apiKey = mockSafeStorage.decryptString(apiKeyRow.value)

       // Lazy Creation for Vision
       if (!conversationId) {
         try {
           const result = db.prepare('INSERT INTO conversations (title) VALUES (?)').run('New Chat')
           conversationId = result.lastInsertRowid
           let dbContent = message + `\n\n[Attached ${attachments.length} image(s)]`
           db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', dbContent)
           event.sender.send('chat:created', conversationId)

           // Auto-Rename for Vision
           if (message && message.trim().length > 0) {
             generateTitle(message, apiKey).then(newTitle => {
               if (newTitle) {
                 db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(newTitle, conversationId)
                 event.sender.send('chat:title-updated')
               }
             })
           }
         } catch(e) { console.error('Vision Lazy Create Failed', e) }
       }

       try {
         const fullResponse = await callVisionModel(
           message,
           attachments,
           apiKey,
           (token) => event.sender.send('chat:stream-chunk', token)
         )
         event.sender.send('chat:stream-end')
         
         // Save Assistant Response
         if (conversationId && fullResponse) {
           db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'assistant', fullResponse)
         }

         // Trigger Auto-Rename for Vision (After successful response)
         if (conversationId) {
            const chat = db.prepare('SELECT title, (SELECT COUNT(*) FROM messages WHERE conversation_id = ?) as msg_count FROM conversations WHERE id = ?').get(conversationId, conversationId)
            // Rename if "New Chat" or very few messages (e.g. 2: user image + assistant reply)
            if (chat && (chat.title === 'New Chat' || chat.msg_count <= 2)) {
               const apiKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key')
               if (apiKeyRow) {
                  const apiKey = mockSafeStorage.decryptString(apiKeyRow.value)
                  // Use the text prompt for title generation. If empty, maybe "Image Analysis"?
                  const titlePrompt = (message && message.trim().length > 0) ? message : "Image Analysis"
                  
                  generateTitle(titlePrompt, apiKey).then(newTitle => {
                    if (newTitle) {
                      db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(newTitle, conversationId)
                      event.sender.send('chat:title-updated')
                    }
                  })
               }
            }
         }
       } catch (err) {
         console.error('Vision Error:', err)
         event.sender.send('app:error', `⚠️ Vision Model Error: ${err.message}`)
         event.sender.send('chat:stream-end')
       }
       return
    }

    // --- Web Search Logic ---
    if (isWebSearch) {
      const apiKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key')
      const tavilyKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('tavily_key')
      
      if (!apiKeyRow || !tavilyKeyRow) {
        event.sender.send('app:error', '⚠️ Missing API Keys (DeepSeek or Tavily). Please check Settings.')
        event.sender.send('chat:stream-end')
        return
      }

      const apiKey = mockSafeStorage.decryptString(apiKeyRow.value)
      const tavilyKey = mockSafeStorage.decryptString(tavilyKeyRow.value)

      // Lazy Creation for Web Search
      if (!conversationId) {
         try {
           const result = db.prepare('INSERT INTO conversations (title) VALUES (?)').run('New Chat')
           conversationId = result.lastInsertRowid
           db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', message)
           event.sender.send('chat:created', conversationId)
         } catch(e) { console.error('WebSearch Lazy Create Failed', e) }
      }

      try {
        const fullResponse = await runWebSearchChain(
          message, 
          apiKey, 
          tavilyKey, 
          (token) => event.sender.send('chat:stream-chunk', token),
          (status) => event.sender.send('chat:search-update', status)
        )
        event.sender.send('chat:stream-end')
        
        // Save Assistant Response
        if (conversationId && fullResponse) {
          db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'assistant', fullResponse)
        }
      } catch (err) {
        // Error handled in service, already sent to frontend via onToken if needed
        // But we should ensure stream ends
        event.sender.send('chat:stream-end')
      }
      return
    }

    // --- Normal Chat Logic ---
    callDeepSeek(message, event.sender, conversationId, isReasoning)

    // Trigger Auto-Rename for Normal Chat (if it's a new conversation or first message)
    // We already do this inside callDeepSeek's "Lazy Creation" logic, but only if conversationId was null.
    // What if conversationId exists but title is "New Chat"?
    // Let's add a check here or inside callDeepSeek to ensure renaming happens.
    // Actually, callDeepSeek handles it for new chats.
    // If the user created a "New Chat" via UI (conversationId exists but empty messages), 
    // we need to handle renaming there too.
    
    // Check if title is 'New Chat' and update it
    if (conversationId) {
      const chat = db.prepare('SELECT title, (SELECT COUNT(*) FROM messages WHERE conversation_id = ?) as msg_count FROM conversations WHERE id = ?').get(conversationId, conversationId)
      if (chat && (chat.title === 'New Chat' || chat.msg_count <= 2)) { // <= 2 because we just inserted the user message
         const apiKeyRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key')
         if (apiKeyRow) {
            const apiKey = mockSafeStorage.decryptString(apiKeyRow.value)
            generateTitle(message, apiKey).then(newTitle => {
              if (newTitle) {
                db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(newTitle, conversationId)
                event.sender.send('chat:title-updated')
              }
            })
         }
      }
    }
  })

  // --- Session Management ---

  // 6. Get All Conversations
  ipcMain.handle('chat:get-conversations', () => {
    return db.prepare('SELECT * FROM conversations ORDER BY created_at DESC').all()
  })

  // 7. Create New Conversation
  ipcMain.handle('chat:create-conversation', (_, title) => {
    const result = db.prepare('INSERT INTO conversations (title) VALUES (?)').run(title || 'New Chat')
    return result.lastInsertRowid
  })

  // 8. Delete Conversation
  ipcMain.handle('chat:delete-conversation', (_, id) => {
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id)
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
    return true
  })

  // 2. Stop Generation
  ipcMain.on('chat:stop', () => {
    if (currentRequest) {
      currentRequest.abort()
      currentRequest = null
      console.log('[IPC] Request aborted by user')
    }
  })

  // 3. Save API Key (Generic for both keys)
  ipcMain.handle('settings:save-key', (_, key, type = 'api_key') => {
    console.log('Saving key:', type)
    const encrypted = mockSafeStorage.encryptString(key)
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    stmt.run(type, encrypted)
    return true
  })

  // 4. Get Keys status
  ipcMain.handle('settings:get-keys-status', () => {
    const hasDeepSeek = !!db.prepare('SELECT value FROM settings WHERE key = ?').get('api_key')
    const hasTavily = !!db.prepare('SELECT value FROM settings WHERE key = ?').get('tavily_key')
    return { hasDeepSeek, hasTavily }
  })
  
  // 5. Load History
  ipcMain.handle('chat:load-history', (_, conversationId) => {
    return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(conversationId || 1)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
