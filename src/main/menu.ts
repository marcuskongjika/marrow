import { Menu, app, dialog, shell, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand, type ThemeMode } from '../shared/types'
import { store } from './store'
import {
  applyThemeSource,
  broadcastTheme,
  openPaths,
  primaryWindow,
  createMainWindow,
  allWindows
} from './windows'

/**
 * Native menus for both platforms. Every shortcut in the app is a menu
 * accelerator rather than a `globalShortcut`, so the OS shows the binding next
 * to the command and nothing is captured while Marrow is in the background.
 *
 * Menu items that need document context just forward a typed command to the
 * focused renderer.
 */

const isMac = process.platform === 'darwin'

function send(command: MenuCommand): void {
  const window = primaryWindow()
  if (!window) return
  window.webContents.send(IPC.onMenuCommand, command)
}

function commandItem(
  label: string,
  command: MenuCommand,
  accelerator?: string
): MenuItemConstructorOptions {
  return {
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => send(command)
  }
}

async function openViaDialog(): Promise<void> {
  const window = primaryWindow() ?? createMainWindow()
  const result = await dialog.showOpenDialog(window, {
    title: 'Open Markdown',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled) return
  await openPaths(result.filePaths, window)
}

function recentFilesSubmenu(): MenuItemConstructorOptions[] {
  const recent = store().recentFiles
  if (recent.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }]
  }
  const items: MenuItemConstructorOptions[] = recent.map((entry, index) => ({
    label: `${index + 1}. ${entry.name}`,
    toolTip: entry.path,
    click: () => {
      void openPaths([entry.path])
    }
  }))
  items.push(
    { type: 'separator' },
    {
      label: 'Clear Recent Files',
      click: () => {
        store().clearRecentFiles()
        app.clearRecentDocuments()
        rebuildMenu()
        for (const window of allWindows()) {
          window.webContents.send(IPC.onRecentChanged, [])
        }
      }
    }
  )
  return items
}

function themeSubmenu(): MenuItemConstructorOptions[] {
  const current = store().settings.theme
  const option = (label: string, mode: ThemeMode): MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: current === mode,
    click: () => {
      store().updateSettings({ theme: mode })
      applyThemeSource()
      broadcastTheme()
      rebuildMenu()
    }
  })
  return [option('Light', 'light'), option('Dark', 'dark'), option('Follow System', 'system')]
}

function buildTemplate(): MenuItemConstructorOptions[] {
  const fileMenu: MenuItemConstructorOptions = {
    label: '&File',
    submenu: [
      {
        label: 'Open…',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          void openViaDialog()
        }
      },
      { label: 'Open Recent', submenu: recentFilesSubmenu() },
      { type: 'separator' },
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => {
          createMainWindow()
        }
      },
      commandItem('Close Tab', 'file:close-tab', 'CmdOrCtrl+W'),
      { type: 'separator' },
      commandItem('Export as HTML…', 'file:export-html', 'CmdOrCtrl+Shift+E'),
      commandItem('Export as PDF…', 'file:export-pdf', 'CmdOrCtrl+Shift+P'),
      commandItem('Print…', 'file:print', 'CmdOrCtrl+P'),
      { type: 'separator' },
      // Explicit accelerator: the `close` role defaults to Cmd+W, which Close
      // Tab already owns.
      { role: 'close', label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W' },
      ...(isMac
        ? []
        : ([
            { type: 'separator' },
            { role: 'quit', label: 'Exit' }
          ] as MenuItemConstructorOptions[]))
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: '&Edit',
    submenu: [
      { role: 'copy' },
      { role: 'selectAll' },
      { type: 'separator' },
      commandItem('Find in Document…', 'edit:find', 'CmdOrCtrl+F'),
      commandItem('Find Next', 'edit:find-next', 'CmdOrCtrl+G'),
      commandItem('Find Previous', 'edit:find-prev', 'CmdOrCtrl+Shift+G'),
      { type: 'separator' },
      commandItem('Copy Document Text', 'edit:copy-document', 'CmdOrCtrl+Shift+C')
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: '&View',
    submenu: [
      commandItem('Toggle Sidebar', 'view:toggle-toc', 'CmdOrCtrl+B'),
      commandItem('Toggle Markdown Source', 'view:toggle-source', 'CmdOrCtrl+U'),
      { type: 'separator' },
      { label: 'Theme', submenu: themeSubmenu() },
      { type: 'separator' },
      commandItem('Zoom In', 'view:zoom-in', 'CmdOrCtrl+Plus'),
      // Chromium reports the unshifted key for `Cmd+=`, so both are bound.
      { ...commandItem('Zoom In', 'view:zoom-in', 'CmdOrCtrl+='), visible: false },
      commandItem('Zoom Out', 'view:zoom-out', 'CmdOrCtrl+-'),
      commandItem('Actual Size', 'view:zoom-reset', 'CmdOrCtrl+0'),
      { type: 'separator' },
      commandItem('Reload Document', 'view:reload-document', 'CmdOrCtrl+R'),
      { role: 'togglefullscreen' },
      ...(app.isPackaged
        ? []
        : ([{ type: 'separator' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
    ]
  }

  const goMenu: MenuItemConstructorOptions = {
    label: '&Go',
    submenu: [
      // Cmd+Tab belongs to macOS, so tab cycling uses Ctrl+Tab everywhere and
      // adds the brace shortcuts macOS users expect from browsers.
      commandItem('Next Tab', 'file:next-tab', 'Ctrl+Tab'),
      commandItem('Previous Tab', 'file:prev-tab', 'Ctrl+Shift+Tab'),
      ...(isMac
        ? [
            { ...commandItem('Next Tab', 'file:next-tab', 'Cmd+Shift+]'), visible: false },
            { ...commandItem('Previous Tab', 'file:prev-tab', 'Cmd+Shift+['), visible: false }
          ]
        : []),
      { type: 'separator' },
      commandItem('Top of Document', 'nav:top', 'CmdOrCtrl+Up'),
      commandItem('End of Document', 'nav:bottom', 'CmdOrCtrl+Down')
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: '&Window',
    role: 'windowMenu'
  }

  const helpMenu: MenuItemConstructorOptions = {
    label: '&Help',
    role: 'help',
    submenu: [
      commandItem('Keyboard Shortcuts', 'help:shortcuts', 'CmdOrCtrl+/'),
      {
        label: 'Marrow on GitHub',
        click: () => {
          void shell.openExternal('https://github.com/your-org/marrow')
        }
      },
      ...(isMac ? [] : ([{ type: 'separator' }, { role: 'about' }] as MenuItemConstructorOptions[]))
    ]
  }

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }
      ]
    : []

  return [...appMenu, fileMenu, editMenu, viewMenu, goMenu, windowMenu, helpMenu]
}

export function rebuildMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate()))
}

export function setAboutPanel(): void {
  app.setAboutPanelOptions({
    applicationName: 'Marrow',
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron}`,
    copyright: 'MIT licensed · Read your notes down to the bone.'
  })
}
