import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('localRoom', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveConversation: (conversation: unknown) => ipcRenderer.invoke('conversation:save', conversation),
  deleteConversation: (id: string) => ipcRenderer.invoke('conversation:delete', id),
  saveRuntimes: (runtimes: unknown) => ipcRenderer.invoke('runtimes:save', runtimes),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  detectModels: (runtimes: unknown) => ipcRenderer.invoke('models:detect', runtimes),
  pickAttachments: (kind: 'image' | 'file') => ipcRenderer.invoke('attachments:pick', kind),
  exportConversation: (conversation: unknown) => ipcRenderer.invoke('conversation:export', conversation),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  startChat: (payload: unknown) => ipcRenderer.invoke('chat:start', payload),
  stopChat: (requestId: string) => ipcRenderer.send('chat:stop', requestId),
  onChatChunk: (callback: (payload: { requestId: string; text: string }) => void) => {
    const listener = (_event: unknown, payload: { requestId: string; text: string }) => callback(payload);
    ipcRenderer.on('chat:chunk', listener);
    return () => ipcRenderer.removeListener('chat:chunk', listener);
  },
  onChatDone: (callback: (payload: { requestId: string; stopped?: boolean }) => void) => {
    const listener = (_event: unknown, payload: { requestId: string; stopped?: boolean }) => callback(payload);
    ipcRenderer.on('chat:done', listener);
    return () => ipcRenderer.removeListener('chat:done', listener);
  },
  onChatError: (callback: (payload: { requestId: string; message: string }) => void) => {
    const listener = (_event: unknown, payload: { requestId: string; message: string }) => callback(payload);
    ipcRenderer.on('chat:error', listener);
    return () => ipcRenderer.removeListener('chat:error', listener);
  },
});
