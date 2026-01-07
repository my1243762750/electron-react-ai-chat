import { autoUpdater } from 'electron-updater'
import log from 'electron-log'
import { ipcMain } from 'electron'

// Configure logging
log.transports.file.level = 'info'
autoUpdater.logger = log

// Disable auto downloading of updates (optional, we can let user choose)
// autoUpdater.autoDownload = false 

export function setupUpdateHandlers(mainWindow) {
  // --- Updater Events ---

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...')
    mainWindow.webContents.send('update:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available.', info)
    mainWindow.webContents.send('update:status', { status: 'available', info })
  })

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available.', info)
    mainWindow.webContents.send('update:status', { status: 'not-available', info })
  })

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater. ' + err)
    mainWindow.webContents.send('update:status', { status: 'error', error: err.message })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%'
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')'
    log.info(log_message)
    mainWindow.webContents.send('update:status', { status: 'downloading', progress: progressObj })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded')
    mainWindow.webContents.send('update:status', { status: 'downloaded', info })
  })

  // --- IPC Handlers for Renderer to trigger actions ---

  // Check for updates manually
  ipcMain.handle('update:check', () => {
    autoUpdater.checkForUpdatesAndNotify()
  })

  // Download update (if autoDownload is false)
  ipcMain.handle('update:download', () => {
    autoUpdater.downloadUpdate()
  })

  // Quit and Install
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })
}

export function checkForUpdates() {
  try {
    autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    log.error('Failed to check for updates:', e)
  }
}
