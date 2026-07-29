import 'dotenv/config';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { configure, createClient } from 'tdl';
import { getTdjson } from 'prebuilt-tdlib';
import { logger } from './logger';

const isDev = process.argv.includes('--dev');
const appDataPath = app.getPath('userData');
const tdlibDataPath = join(appDataPath, 'tdlib');

logger.info('app started', { isDev, appDataPath, tdlibDataPath });

if (!existsSync(tdlibDataPath)) {
  mkdirSync(tdlibDataPath, { recursive: true });
}

let mainWindow: BrowserWindow | null = null;
let lastAuthState: Record<string, unknown> | null = null;

async function initializeTDLib() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
  const apiHash = process.env.TELEGRAM_API_HASH || '';

  if (!apiId || !apiHash) {
    logger.warn('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in environment');
  }

  logger.tdlib.invoke('configure');
  configure({ tdjson: getTdjson() });

  logger.tdlib.invoke('createClient');
  const client = createClient({
    apiId,
    apiHash,
    tdlibParameters: {
      database_directory: join(tdlibDataPath, 'db'),
      files_directory: join(tdlibDataPath, 'files'),
      database_encryption_key: '',
      use_file_database: true,
      use_chat_info_database: true,
      use_message_database: true,
      use_secret_chats: true,
      system_language_code: 'en',
      device_model: 'Desktop',
      system_version: process.platform,
      application_version: app.getVersion(),
    },
  });

  client.on('update', (update) => {
    const upd = update as Record<string, unknown>;
    logger.tdlib.receive(upd);
    handleAuthState(upd);
    if (upd._ === 'updateUser') {
      const user = (upd as any).user || {};
      logger.info('updateUser', { id: user.id, has_photo: !!user.profile_photo, photo_small_id: user.profile_photo?.small?.id, photo_small_path: user.profile_photo?.small?.local?.path });
    }
    if (upd._ === 'updateFile') {
      const file = (upd as any).file || {};
      logger.info('updateFile', { file_id: file.id, path: file.local?.path, completed: file.local?.is_downloading_completed });
    }
    if (mainWindow) {
      mainWindow.webContents.send('tdlib-update', update);
    }
  });

  client.on('error', (error: Error) => {
    logger.tdlib.error(error);
    mainWindow?.webContents.send('tdlib-error', error.message);
  });

  client.on('close', () => {
    logger.tdlib.close();
    mainWindow?.webContents.send('tdlib-closed');
  });

  return client;
}

function handleAuthState(update: Record<string, unknown>) {
  if (update._ === 'updateAuthorizationState') {
    lastAuthState = update.authorization_state as Record<string, unknown>;
    mainWindow?.webContents.send('auth-state-changed', lastAuthState);
  }
}

function createWindow() {
  logger.info('creating window');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  logger.info('app ready');
  const client = await initializeTDLib();
  registerHandlers(client);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  logger.info('window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});

function registerHandlers(client: ReturnType<typeof createClient>) {
  ipcMain.handle('tdlib-send', async (_e, request) => {
    const req = request as Record<string, unknown>;
    logger.tdlib.send(req._ as string || 'unknown', req);
    const response = await client.invoke(request);
    const resp = response as any;
    if (resp._ === 'messages') {
      logger.info('getChatHistory result', { chat_id: req.chat_id, total_count: resp.total_count, msg_count: resp.messages?.length });
    } else {
      logger.info('tdlib-send response', { method: req._, responseType: resp._ });
    }
    return response;
  });

  ipcMain.handle('auth-send-phone', async (_e, phoneNumber: string) => {
    logger.tdlib.invoke('setAuthenticationPhoneNumber');
    return client.invoke({
      _: 'setAuthenticationPhoneNumber',
      phone_number: phoneNumber,
      settings: { _: 'phoneNumberAuthenticationSettings' },
    });
  });

  ipcMain.handle('auth-send-code', async (_e, code: string) => {
    logger.tdlib.invoke('checkAuthenticationCode');
    return client.invoke({ _: 'checkAuthenticationCode', code });
  });

  ipcMain.handle('auth-send-password', async (_e, password: string) => {
    logger.tdlib.invoke('checkAuthenticationPassword');
    return client.invoke({ _: 'checkAuthenticationPassword', password });
  });

  ipcMain.handle('auth-register', async (_e, firstName: string, lastName: string) => {
    logger.tdlib.invoke('registerUser');
    return client.invoke({ _: 'registerUser', first_name: firstName, last_name: lastName });
  });

  ipcMain.handle('get-chats', async (_e, limit = 50) => {
    logger.tdlib.invoke('getChats');
    return client.invoke({ _: 'getChats', chat_list: { _: 'chatListMain' }, limit });
  });

  ipcMain.handle('get-messages', async (_e, chatId: number, limit = 50) => {
    logger.tdlib.invoke('getChatHistory');
    return client.invoke({
      _: 'getChatHistory',
      chat_id: chatId,
      from_message_id: 0,
      offset: 0,
      limit,
      only_local: false,
    });
  });

  ipcMain.handle('send-message', async (_e, chatId: number, text: string, replyToId?: number) => {
    logger.tdlib.invoke('sendMessage');
    const args: any = {
      _: 'sendMessage',
      chat_id: chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text },
      },
    };
    if (replyToId) args.reply_to = { _: 'inputMessageReplyToMessage', message_id: replyToId };
    return client.invoke(args);
  });

  ipcMain.handle('get-profile', async () => {
    logger.tdlib.invoke('getMe');
    const me = await client.invoke({ _: 'getMe' });
    const m = me as any;
      logger.info('getMe result', {
      id: m.id,
      first_name: m.first_name,
      has_photo: !!m.profile_photo,
      photo_small_id: m.profile_photo?.small?.id,
      photo_small_path: m.profile_photo?.small?.local?.path,
      photo_small_completed: m.profile_photo?.small?.local?.is_downloading_completed,
    });
    return me;
  });

  ipcMain.handle('logout', async () => {
    logger.tdlib.invoke('logOut');
    return client.invoke({ _: 'logOut' });
  });

  ipcMain.handle('get-file', async (_e, fileId: number) => {
    logger.tdlib.invoke('getFile');
    return client.invoke({ _: 'getFile', file_id: fileId });
  });

  ipcMain.handle('download-file', async (_e, fileId: number, priority = 1, synchronous = false) => {
    logger.tdlib.invoke('downloadFile');
    const file = await client.invoke({ _: 'downloadFile', file_id: fileId, priority, synchronous });
    const f = file as any;
    logger.info('downloadFile result', { file_id: f.id, path: f.local?.path, completed: f.local?.is_downloading_completed });
    return file;
  });

  ipcMain.handle('get-auth-state', () => {
    logger.tdlib.invoke('get-auth-state');
    return lastAuthState;
  });

  ipcMain.handle('open-url', async (_e, url: string) => {
    shell.openExternal(url);
  });
}