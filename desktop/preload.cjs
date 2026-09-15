const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('barista', {
  ready: () => ipcRenderer.invoke('barista:ready'),
  openWeb: () => ipcRenderer.send('barista:open-web'),
  hide: () => ipcRenderer.send('barista:hide'),
  appearance: (value) => ipcRenderer.send('barista:appearance', value),
  regions: (regions) => ipcRenderer.send('barista:regions', regions),
  onState: (listener) => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('barista:state', handler);
    return () => ipcRenderer.removeListener('barista:state', handler);
  },
});
