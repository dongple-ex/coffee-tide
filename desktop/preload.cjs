const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('barista', {
  ready: () => ipcRenderer.invoke('barista:ready'),
  openWeb: () => ipcRenderer.send('barista:open-web'),
  action: (name) => ipcRenderer.send('barista:action', name),
  hide: () => ipcRenderer.send('barista:hide'),
  appearance: (value) => ipcRenderer.send('barista:appearance', value),
  chatOpen: (open) => ipcRenderer.send('barista:chat-open', open),
  chatSend: (request) => ipcRenderer.invoke('barista:chat-send', request),
  aiStatus: () => ipcRenderer.invoke('barista:ai-status'),
  aiModels: (value) => ipcRenderer.invoke('barista:ai-models', value),
  aiModelSave: (value) => ipcRenderer.invoke('barista:ai-model-save', value),
  aiUsage: () => ipcRenderer.send('barista:ai-usage'),
  regions: (regions) => ipcRenderer.send('barista:regions', regions),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('barista:state', handler);
    return () => ipcRenderer.removeListener('barista:state', handler);
  },
});
