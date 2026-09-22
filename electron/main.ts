import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, shell } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { deleteConversation, loadData, mergeConversations, saveConversation, saveRuntimes, saveSettings } from './store';
import { detectAll, streamChat } from './runtimes';
import type { Conversation, RuntimeConfig } from './types';

const activeRequests = new Map<string, AbortController>();

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.json', '.jsonl', '.xml', '.yaml', '.yml',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.kt', '.kts', '.c', '.h', '.cpp',
  '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.sql', '.html', '.css',
  '.scss', '.sh', '.ps1', '.bat', '.toml', '.ini', '.env', '.log',
]);

async function pickAttachments(window: BrowserWindow | null, kind: 'image' | 'file') {
  const options: Electron.OpenDialogOptions = {
    title: kind === 'image' ? 'Attach images' : 'Attach text or code files',
    properties: ['openFile', 'multiSelections'],
    filters: kind === 'image'
      ? [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      : [{ name: 'Documents and code', extensions: [...TEXT_EXTENSIONS].map((extension) => extension.slice(1)) }],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled) return [];
  if (result.filePaths.length > 4) throw new Error('Attach up to four items at a time.');

  return Promise.all(result.filePaths.map(async (filePath) => {
    const stat = await fs.stat(filePath);
    const name = path.basename(filePath);
    if (kind === 'image') {
      if (stat.size > 12 * 1024 * 1024) throw new Error(`${name} is larger than the 12 MB image limit.`);
      const original = await fs.readFile(filePath);
      const image = nativeImage.createFromBuffer(original);
      if (image.isEmpty()) throw new Error(`${name} could not be read as an image.`);
      const dimensions = image.getSize();
      const maxDimension = 1800;
      const scale = Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height));
      const resized = scale < 1
        ? image.resize({ width: Math.round(dimensions.width * scale), height: Math.round(dimensions.height * scale), quality: 'good' })
        : image;
      const extension = path.extname(filePath).toLowerCase();
      const keepOriginal = scale === 1 && original.length <= 2 * 1024 * 1024;
      const resizedPng = !keepOriginal && extension === '.png' ? resized.toPNG() : null;
      const encoded = keepOriginal ? original : resizedPng && resizedPng.length <= 4 * 1024 * 1024 ? resizedPng : resized.toJPEG(84);
      const mimeType = keepOriginal
        ? extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
        : resizedPng && encoded === resizedPng ? 'image/png' : 'image/jpeg';
      return {
        id: randomUUID(), name, kind: 'image' as const, mimeType, size: encoded.length,
        dataUrl: `data:${mimeType};base64,${encoded.toString('base64')}`,
      };
    }

    const extension = path.extname(filePath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) throw new Error(`${name} is not a supported text or code file.`);
    if (stat.size > 256 * 1024) throw new Error(`${name} is larger than the 256 KB text-file limit.`);
    const text = await fs.readFile(filePath, 'utf8');
    if (text.includes('\0')) throw new Error(`${name} appears to be a binary file.`);
    return { id: randomUUID(), name, kind: 'text' as const, mimeType: 'text/plain', size: stat.size, text };
  }));
}

function markdownConversation(conversation: Conversation) {
  const sections = conversation.messages.map((message) => {
    const heading = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Assistant' : 'System';
    const attachments = message.attachments?.length
      ? `\n\n_Attachments: ${message.attachments.map((attachment) => attachment.name).join(', ')}_`
      : '';
    return `## ${heading}\n\n${message.content}${attachments}`;
  });
  return `# ${conversation.title}\n\n${sections.join('\n\n---\n\n')}\n`;
}

async function exportConversation(window: BrowserWindow | null, conversation: Conversation) {
  const options: Electron.SaveDialogOptions = {
    title: 'Export conversation',
    defaultPath: `${conversation.title.replace(/[<>:"/\\|?*]/g, '-').slice(0, 70) || 'Local Room chat'}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, markdownConversation(conversation), 'utf8');
  return true;
}

async function exportBackup(window: BrowserWindow | null) {
  const options: Electron.SaveDialogOptions = {
    title: 'Back up Local Room',
    defaultPath: `Local Room backup ${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Local Room backup', extensions: ['json'] }],
  };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, JSON.stringify({ version: 1, exportedAt: Date.now(), ...(await loadData()) }, null, 2), 'utf8');
  return true;
}

function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Conversation>;
  return typeof item.id === 'string' && typeof item.title === 'string'
    && typeof item.modelId === 'string' && typeof item.runtimeId === 'string'
    && typeof item.createdAt === 'number' && typeof item.updatedAt === 'number'
    && Array.isArray(item.messages) && item.messages.every((message) => message && typeof message === 'object'
      && typeof message.id === 'string' && typeof message.role === 'string'
      && typeof message.content === 'string' && typeof message.createdAt === 'number');
}

async function importBackup(window: BrowserWindow | null) {
  const options: Electron.OpenDialogOptions = {
    title: 'Restore Local Room conversations', properties: ['openFile'],
    filters: [{ name: 'Local Room backup', extensions: ['json'] }],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const stat = await fs.stat(result.filePaths[0]);
  if (stat.size > 100 * 1024 * 1024) throw new Error('This backup is larger than the 100 MB import limit.');
  const parsed = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')) as { conversations?: unknown[] };
  if (!Array.isArray(parsed.conversations)) throw new Error('This is not a valid Local Room backup.');
  const conversations = parsed.conversations.filter(isConversation);
  if (!conversations.length && parsed.conversations.length) throw new Error('No valid conversations were found in this backup.');
  return { imported: conversations.length, conversations: await mergeConversations(conversations) };
}

function createWindow() {
  nativeTheme.themeSource = 'dark';
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 930,
    minHeight: 650,
    backgroundColor: '#111210',
    title: 'Local Room',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once('ready-to-show', () => window.show());
  window.webContents.once('did-finish-load', () => {
    if (!window.isVisible()) window.show();
  });
  window.webContents.on('did-fail-load', (_event, code, description) => {
    console.error(`Local Room failed to load (${code}): ${description}`);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || (!input.control && !input.meta)) return;
    const key = input.key.toLowerCase();
    const current = window.webContents.getZoomFactor();
    if (key === '+' || key === '=') {
      event.preventDefault();
      window.webContents.setZoomFactor(Math.min(1.6, Math.round((current + 0.1) * 10) / 10));
    } else if (key === '-' || key === '_') {
      event.preventDefault();
      window.webContents.setZoomFactor(Math.max(0.75, Math.round((current - 0.1) * 10) / 10));
    } else if (key === '0') {
      event.preventDefault();
      window.webContents.setZoomFactor(1);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('data:load', () => loadData());
  ipcMain.handle('conversation:save', (_event, conversation) => saveConversation(conversation));
  ipcMain.handle('conversation:delete', (_event, id: string) => deleteConversation(id));
  ipcMain.handle('runtimes:save', (_event, runtimes: RuntimeConfig[]) => saveRuntimes(runtimes));
  ipcMain.handle('settings:save', (_event, settings) => saveSettings(settings));
  ipcMain.handle('models:detect', async (_event, runtimes: RuntimeConfig[]) => detectAll(runtimes));
  ipcMain.handle('attachments:pick', (event, kind: 'image' | 'file') => pickAttachments(BrowserWindow.fromWebContents(event.sender), kind));
  ipcMain.handle('conversation:export', (event, conversation: Conversation) => exportConversation(BrowserWindow.fromWebContents(event.sender), conversation));
  ipcMain.handle('backup:export', (event) => exportBackup(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle('backup:import', (event) => importBackup(BrowserWindow.fromWebContents(event.sender)));

  ipcMain.handle('chat:start', async (event, payload) => {
    const requestId = payload.requestId || randomUUID();
    const controller = new AbortController();
    activeRequests.set(requestId, controller);
    try {
      await streamChat({
        ...payload,
        signal: controller.signal,
        onChunk: (text) => event.sender.send('chat:chunk', { requestId, text }),
      });
      event.sender.send('chat:done', { requestId });
    } catch (error) {
      if (!controller.signal.aborted) {
        event.sender.send('chat:error', {
          requestId,
          message: error instanceof Error ? error.message : 'The local model stopped unexpectedly.',
        });
      } else {
        event.sender.send('chat:done', { requestId, stopped: true });
      }
    } finally {
      activeRequests.delete(requestId);
    }
    return requestId;
  });

  ipcMain.on('chat:stop', (event, requestId: string) => {
    const controller = activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      activeRequests.delete(requestId);
    }
    event.sender.send('chat:done', { requestId, stopped: true });
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
