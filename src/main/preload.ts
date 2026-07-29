import { contextBridge, ipcRenderer } from 'electron';

interface TdObject {
  '@type': string;
  [key: string]: unknown;
}

interface TDLibAPI {
  send: (request: TdObject) => Promise<TdObject>;
  onUpdate: (callback: (update: TdObject) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
  onClosed: (callback: () => void) => () => void;
  onAuthStateChanged: (callback: (state: TdObject) => void) => () => void;
  getAuthState: () => Promise<TdObject | null>;
  auth: {
    sendPhone: (phoneNumber: string) => Promise<TdObject>;
    sendCode: (code: string) => Promise<TdObject>;
    sendPassword: (password: string) => Promise<TdObject>;
    register: (firstName: string, lastName: string) => Promise<TdObject>;
  };
  chats: {
    getChats: (limit?: number) => Promise<TdObject>;
    getMessages: (chatId: number, limit?: number) => Promise<TdObject>;
    sendMessage: (chatId: number, text: string, replyToId?: number) => Promise<TdObject>;
  };
  profile: {
    getProfile: () => Promise<TdObject>;
    logout: () => Promise<TdObject>;
  };
  files: {
    getFile: (fileId: number) => Promise<TdObject>;
    downloadFile: (fileId: number, priority?: number, synchronous?: boolean) => Promise<TdObject>;
  };
  shell: {
    openUrl: (url: string) => Promise<void>;
  };
}

const tdlib: TDLibAPI = {
  send: (request) => ipcRenderer.invoke('tdlib-send', request),
  onUpdate: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, update: TdObject) => callback(update);
    ipcRenderer.on('tdlib-update', handler);
    return () => { ipcRenderer.removeListener('tdlib-update', handler); };
  },
  onError: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, error: string) => callback(error);
    ipcRenderer.on('tdlib-error', handler);
    return () => { ipcRenderer.removeListener('tdlib-error', handler); };
  },
  onClosed: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('tdlib-closed', handler);
    return () => { ipcRenderer.removeListener('tdlib-closed', handler); };
  },
  onAuthStateChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: TdObject) => callback(state);
    ipcRenderer.on('auth-state-changed', handler);
    return () => { ipcRenderer.removeListener('auth-state-changed', handler); };
  },
  getAuthState: () => ipcRenderer.invoke('get-auth-state'),
  auth: {
    sendPhone: (phoneNumber) => ipcRenderer.invoke('auth-send-phone', phoneNumber),
    sendCode: (code) => ipcRenderer.invoke('auth-send-code', code),
    sendPassword: (password) => ipcRenderer.invoke('auth-send-password', password),
    register: (firstName, lastName) => ipcRenderer.invoke('auth-register', firstName, lastName),
  },
  chats: {
    getChats: (limit) => ipcRenderer.invoke('get-chats', limit),
    getMessages: (chatId, limit) => ipcRenderer.invoke('get-messages', chatId, limit),
    sendMessage: (chatId, text, replyToId) => ipcRenderer.invoke('send-message', chatId, text, replyToId),
  },
  profile: {
    getProfile: () => ipcRenderer.invoke('get-profile'),
    logout: () => ipcRenderer.invoke('logout'),
  },
  files: {
    getFile: (fileId) => ipcRenderer.invoke('get-file', fileId),
    downloadFile: (fileId, priority, synchronous = false) => ipcRenderer.invoke('download-file', fileId, priority, synchronous),
  },
  shell: {
    openUrl: (url) => ipcRenderer.invoke('open-url', url),
  },
};

contextBridge.exposeInMainWorld('tdlib', tdlib);