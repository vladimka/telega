export interface Chat {
  id: number;
  title: string;
  unread_count: number;
  last_message?: { content: { text?: { text: string } } };
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 86400000) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (diff < 604800000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

export function filterChats(chats: Chat[], query: string): Chat[] {
  if (!query.trim()) return chats;
  const lowerQuery = query.toLowerCase();
  return chats.filter(chat =>
    chat.title.toLowerCase().includes(lowerQuery)
  );
}

export function formatUnreadCount(count: number): string {
  if (count === 0) return '';
  if (count > 99) return '99+';
  return count.toString();
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getAvatarColor(name: string): string {
  const colors = [
    '#1a73e8', '#ea4335', '#fbbc04', '#34a853',
    '#ff6d01', '#46bdc6', '#a142f4', '#ff3d8a',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export interface TDLibAPI {
  send: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
  onUpdate: (callback: (update: Record<string, unknown>) => void) => () => void;
  onError: (callback: (error: string) => void) => () => void;
  onClosed: (callback: () => void) => () => void;
  onAuthStateChanged: (callback: (state: Record<string, unknown>) => void) => () => void;
  getAuthState: () => Promise<Record<string, unknown> | null>;
  auth: {
    sendPhone: (phoneNumber: string) => Promise<Record<string, unknown>>;
    sendCode: (code: string) => Promise<Record<string, unknown>>;
    sendPassword: (password: string) => Promise<Record<string, unknown>>;
    register: (firstName: string, lastName: string) => Promise<Record<string, unknown>>;
  };
  chats: {
    getChats: (limit?: number) => Promise<Record<string, unknown>>;
    getMessages: (chatId: number, limit?: number) => Promise<Record<string, unknown>>;
    sendMessage: (chatId: number, text: string) => Promise<Record<string, unknown>>;
  };
  profile: {
    getProfile: () => Promise<Record<string, unknown>>;
    logout: () => Promise<Record<string, unknown>>;
  };
  files: {
    getFile: (fileId: number) => Promise<Record<string, unknown>>;
    downloadFile: (fileId: number, priority?: number, synchronous?: boolean) => Promise<Record<string, unknown>>;
  };
  shell: {
    openUrl: (url: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    tdlib: TDLibAPI;
  }
}