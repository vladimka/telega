import { vi } from 'vitest';

Object.defineProperty(window, 'tdlib', {
  value: {
    send: vi.fn(),
    execute: vi.fn(),
    onUpdate: vi.fn(() => vi.fn()),
    onError: vi.fn(() => vi.fn()),
    onClosed: vi.fn(() => vi.fn()),
    onAuthStateChanged: vi.fn(() => vi.fn()),
    auth: {
      sendPhone: vi.fn(),
      sendCode: vi.fn(),
      sendPassword: vi.fn(),
      register: vi.fn(),
    },
    chats: {
      getChats: vi.fn(),
      getMessages: vi.fn(),
      sendMessage: vi.fn(),
    },
    profile: {
      getProfile: vi.fn(),
      logout: vi.fn(),
    },
    files: {
      getFile: vi.fn(),
      downloadFile: vi.fn(),
    },
  },
  writable: true,
});

Object.defineProperty(window, 'ipcRenderer', {
  value: {
    invoke: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  writable: true,
});