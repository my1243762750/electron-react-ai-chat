import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  sendMessage: (message, conversationId, isReasoning = false, isWebSearch = false, attachments = []) => ipcRenderer.send('chat:send', { message, conversationId, isReasoning, isWebSearch, attachments }),
  stopGeneration: () => ipcRenderer.send('chat:stop'),
  
  // Stream listeners
  onStreamChunk: (callback) => {
    const subscription = (_event, chunk) => callback(chunk)
    ipcRenderer.on('chat:stream-chunk', subscription)
    return () => ipcRenderer.removeListener('chat:stream-chunk', subscription)
  },
  onStreamReasoning: (callback) => {
    const subscription = (_event, chunk) => callback(chunk)
    ipcRenderer.on('chat:stream-reasoning', subscription)
    return () => ipcRenderer.removeListener('chat:stream-reasoning', subscription)
  },
  onSearchUpdate: (callback) => {
    const subscription = (_event, status) => callback(status)
    ipcRenderer.on('chat:search-update', subscription)
    return () => ipcRenderer.removeListener('chat:search-update', subscription)
  },
  onStreamEnd: (callback) => {
    const subscription = () => callback()
    ipcRenderer.on('chat:stream-end', subscription)
    return () => ipcRenderer.removeListener('chat:stream-end', subscription)
  },
  onTitleUpdated: (callback) => {
    const subscription = () => callback()
    ipcRenderer.on('chat:title-updated', subscription)
    return () => ipcRenderer.removeListener('chat:title-updated', subscription)
  },
  onChatCreated: (callback) => {
    const subscription = (_event, newId) => callback(newId)
    ipcRenderer.on('chat:created', subscription)
    return () => ipcRenderer.removeListener('chat:created', subscription)
  },
  onAppError: (callback) => {
    const subscription = (_event, message) => callback(message)
    ipcRenderer.on('app:error', subscription)
    return () => ipcRenderer.removeListener('app:error', subscription)
  },

  // Database ops
  loadHistory: (conversationId) => ipcRenderer.invoke('chat:load-history', conversationId),
  getConversations: () => ipcRenderer.invoke('chat:get-conversations'),
  createConversation: (title) => ipcRenderer.invoke('chat:create-conversation', title),
  deleteConversation: (id) => ipcRenderer.invoke('chat:delete-conversation', id),
  
  // Settings
  saveApiKey: (key, type) => ipcRenderer.invoke('settings:save-key', key, type),
  getKeysStatus: () => ipcRenderer.invoke('settings:get-keys-status'),
  hasApiKey: () => ipcRenderer.invoke('settings:has-key') // Deprecated, kept for compat
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  console.log('process.contextIsolated', process.contextIsolated);
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
