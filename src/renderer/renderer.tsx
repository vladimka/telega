import { createElement, useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type AuthState = 'waitPhoneNumber' | 'waitCode' | 'waitPassword' | 'waitRegistration' | 'ready' | 'closed';

type ChatType = 'private' | 'group' | 'channel' | 'secret';
type Chat = { id: number; title: string; lastMessage?: string; lastMessageId?: number; unreadCount: number; lastMessageTime: number; photo?: any; type: string; chatType: ChatType };
type Message = { id: number; chatId: number; senderId: number; senderIsChat: boolean; text: string; isOutgoing: boolean; date: number; forwardInfo?: any; contentType: string; photoFileId?: number; photoPath?: string; photoWidth?: number; photoHeight?: number; replyToMsgId?: number; media?: any; fileIds?: number[]; filePaths?: Record<number, string>; entities?: Array<{ offset: number; length: number; type: string; url?: string }>; serviceText?: string; sendingState?: string; isRead?: boolean };

function App() {
  const [authState, setAuthState] = useState<AuthState>('waitPhoneNumber');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const selectedChatIdRef = useRef(selectedChatId);
  selectedChatIdRef.current = selectedChatId;
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<Record<number, { firstName: string; lastName: string }>>({});
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  const hasMoreRef = useRef(true);
  const chatListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const lastReadOutboxRef = useRef<Record<number, number>>({});

  const toFileUrl = (path: string) => 'file:///' + path.replace(/\\/g, '/').replace(/^\/+/, '');

  const scrollToBottom = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleAuthStateChange = useCallback((state: any) => {
    const type = state._;
    setAuthState(type === 'authorizationStateReady' ? 'ready' : type === 'authorizationStateWaitPhoneNumber' ? 'waitPhoneNumber' : type === 'authorizationStateWaitCode' ? 'waitCode' : type === 'authorizationStateWaitPassword' ? 'waitPassword' : type === 'authorizationStateWaitRegistration' ? 'waitRegistration' : 'closed');
    setError('');
    if (type === 'authorizationStateReady') loadInitialData();
  }, []);

  const handleUpdate = useCallback((update: any) => {
    switch (update._) {
      case 'updateNewChat':
        setChats(prev => {
          if (prev.some(c => c.id === update.chat.id)) return prev;
          const chat = formatChat(update.chat);
          triggerPhotoDownload(chat);
          return [...prev, chat];
        });
        break;
      case 'updateChatLastMessage':
        setChats(prev => prev.map(c => c.id === update.chat_id ? { ...c, lastMessage: update.last_message?.content?.text?.text || '', lastMessageTime: update.last_message?.date || 0 } : c));
        break;
      case 'updateNewMessage': {
        const fm = formatMessage(update.message);
        if (selectedChatIdRef.current === update.message.chat_id) {
          setMessages(prev => prev.some(m => m.id === fm.id) ? prev : [...prev, fm]);
          if (fm.photoFileId) downloadPhoto(fm.id, fm.photoFileId);
          if (fm.fileIds) fm.fileIds.forEach(fid => { if (fid !== fm.photoFileId) downloadFileById(fm.id, fid); });
        }
        setChats(prev => prev.map(c => c.id === update.message.chat_id ? { ...c, lastMessage: update.message.content?.text?.text || '', lastMessageTime: update.message.date, unreadCount: c.id !== selectedChatIdRef.current ? c.unreadCount + 1 : 0 } : c));
        break;
      }
      case 'updateMessageContent':
        setMessages(prev => prev.map(m => m.id === update.message_id ? { ...m, text: update.new_content?.text?.text || m.text } : m));
        break;
      case 'updateMessageSendSucceeded':
        setMessages(prev => prev.map(m => {
          if (m.id === update.old_message_id || m.id === update.new_message_id) {
            const readId = lastReadOutboxRef.current[m.chatId] || 0;
            return { ...m, id: update.new_message_id, sendingState: undefined, isRead: readId > 0 && update.new_message_id <= readId };
          }
          return m;
        }));
        break;
      case 'updateChatReadInbox':
        setChats(prev => prev.map(c => c.id === update.chat_id ? { ...c, unreadCount: 0 } : c));
        break;
      case 'updateChatReadOutbox':
        setChats(prev => prev.map(c => c.id === update.chat_id ? { ...c, unreadCount: 0 } : c));
        if (update.last_read_outbox_message_id) {
          lastReadOutboxRef.current[update.chat_id] = update.last_read_outbox_message_id;
        }
        if (selectedChatIdRef.current === update.chat_id) {
          const readId = update.last_read_outbox_message_id || 0;
          if (readId) setMessages(prev => prev.map(m => m.isOutgoing ? { ...m, isRead: m.id <= readId || false } : m));
        }
        break;
      case 'updateUser': {
        const user = (update as any).user;
        if (user) {
          setUsers(prev => ({ ...prev, [user.id]: { firstName: user.first_name || '', lastName: user.last_name || '' } }));
          setCurrentUser((prev: any) => {
            if (prev?.id === user.id) {
              if (user?.profile_photo?.small?.id && !user.profile_photo.small.local?.is_downloading_completed) {
                window.tdlib.files.downloadFile(user.profile_photo.small.id).catch(() => {});
              }
              return user;
            }
            return prev;
          });
        }
        break;
      }
      case 'updateFile': {
        const file = (update as any).file || {};
        const fileId = file.id;
        const localPath = file.local?.is_downloading_completed ? file.local.path : undefined;
        setChats(prev => prev.map(c => {
          if (c.photo?.small?.id === fileId) {
            return { ...c, photo: { ...c.photo, small: file } };
          }
          return c;
        }));
        setCurrentUser((prev: any) => {
          if (prev?.profile_photo?.small?.id === fileId) {
            return { ...prev, profile_photo: { ...prev.profile_photo, small: file } };
          }
          return prev;
        });
        if (localPath) {
          setMessages(prev => prev.map(m => {
            if (m.photoFileId === fileId) return { ...m, photoPath: localPath };
            if (m.fileIds?.includes(fileId)) return { ...m, filePaths: { ...(m.filePaths || {}), [fileId]: localPath } };
            return m;
          }));
        }
        break;
      }
    }
  }, []);

  useEffect(() => {
    const unsubUpdate = window.tdlib.onUpdate(handleUpdate);
    const unsubAuth = window.tdlib.onAuthStateChanged(handleAuthStateChange);
    const unsubError = window.tdlib.onError(err => setError(err));
    window.tdlib.getAuthState().then(state => {
      if (state) handleAuthStateChange(state);
    });
    return () => { unsubUpdate(); unsubAuth(); unsubError(); };
  }, [handleUpdate, handleAuthStateChange]);

  const toggleDark = () => setDarkMode(v => { const next = !v; localStorage.setItem('darkMode', String(next)); return next; });

  const triggerPhotoDownload = (chat: Chat) => {
    const fileId = chat.photo?.small?.id;
    if (fileId && !chat.photo?.small?.local?.is_downloading_completed) {
      window.tdlib.files.downloadFile(fileId).catch(() => {});
    }
  };

  const renderAvatar = (chat: Chat, size = 48) => {
    const isChannel = chat.chatType === 'channel';
    const isGroup = chat.chatType === 'group';
    return createElement('div', {
      className: `chat-avatar ${isChannel ? 'avatar-channel' : ''} ${isGroup ? 'avatar-group' : ''}`,
      style: { minWidth: size, width: size, height: size, fontSize: size * 0.33 }
    },
      chat.photo?.small?.local?.path
        ? createElement('img', { src: toFileUrl(chat.photo.small.local.path), className: 'chat-avatar-img' })
        : createElement('span', null, chat.title?.[0]?.toUpperCase() || '?'),
      (isChannel || isGroup) && createElement('span', { className: `avatar-type-badge ${isChannel ? 'badge-channel' : 'badge-group'}` })
    );
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [me, chatsResult] = await Promise.all([
        window.tdlib.profile.getProfile(),
        window.tdlib.chats.getChats(50)
      ]);
      setCurrentUser(me);
      if (me?.profile_photo?.small?.id) {
        window.tdlib.files.downloadFile(me.profile_photo.small.id).catch(() => {});
      }
      const chatIds: number[] = (chatsResult as any).chat_ids || [];
      const rawChats = await Promise.all(
        chatIds.map(id => window.tdlib.send({ _: 'getChat', chat_id: id }))
      );
      const chats = rawChats.map(formatChat);
      setChats(chats);
      chats.forEach(triggerPhotoDownload);
    } catch (e) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const formatChat = (chat: any): Chat => {
    const tdType = chat.type?._;
    const isChannel = tdType === 'chatTypeSupergroup' && !!chat.type.is_channel;
    let chatType: ChatType = 'private';
    if (tdType === 'chatTypeBasicGroup' || tdType === 'chatTypeSupergroup') chatType = isChannel ? 'channel' : 'group';
    else if (tdType === 'chatTypeSecret') chatType = 'secret';
    return {
      id: chat.id,
      title: chat.title || (tdType === 'chatTypePrivate' ? `${chat.first_name || ''} ${chat.last_name || ''}`.trim() : 'Unknown'),
      lastMessage: chat.last_message?.content?.text?.text || '',
      lastMessageId: Number(chat.last_message?.id) || 0,
      unreadCount: chat.unread_count || 0,
      lastMessageTime: chat.last_message?.date || 0,
      photo: chat.photo,
      type: tdType,
      chatType,
    };
  };

  const formatMessage = (msg: any): Message => {
    const content = msg.content || {};
    let contentType = 'text';
    let photoFileId: number | undefined;
    let photoWidth: number | undefined;
    let photoHeight: number | undefined;
    const textEntities = content.text?.entities || [];
    const captionEntities = content.caption?.entities || [];
    let text = content.text?.text || content.caption?.text || '';
    let media: any = undefined;
    const fileIds: number[] = [];
    let entities = textEntities.concat(captionEntities).map((e: any) => ({
      offset: e.offset,
      length: e.length,
      type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
      url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
    }));
    if (content._ === 'messagePhoto') {
      contentType = 'photo';
      text = content.caption?.text || '';
      entities = captionEntities.map((e: any) => ({
        offset: e.offset,
        length: e.length,
        type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
        url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
      }));
      const sizes = content.photo?.sizes;
      if (sizes?.length) {
        const largest = sizes.reduce((a: any, b: any) => (a.width * a.height > b.width * b.height ? a : b));
        photoFileId = largest?.photo?.id;
        photoWidth = largest?.width;
        photoHeight = largest?.height;
        if (photoFileId) fileIds.push(photoFileId);
      }
      media = { type: 'photo', width: photoWidth, height: photoHeight, fileId: photoFileId };
    } else if (content._ === 'messageVideo') {
      contentType = 'video';
      text = content.caption?.text || '';
      entities = captionEntities.map((e: any) => ({
        offset: e.offset,
        length: e.length,
        type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
        url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
      }));
      const video = content.video || {};
      const fileId = video.video?.id;
      if (fileId) fileIds.push(fileId);
      media = { type: 'video', fileId, width: video.width, height: video.height, duration: video.duration, mimeType: video.mime_type, thumbnail: video.minithumbnail || video.thumbnail?.sizes?.[0] };
    } else if (content._ === 'messageDocument') {
      contentType = 'document';
      text = content.caption?.text || '';
      entities = captionEntities.map((e: any) => ({
        offset: e.offset,
        length: e.length,
        type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
        url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
      }));
      const doc = content.document || {};
      const fileId = doc.document?.id;
      if (fileId) fileIds.push(fileId);
      media = { type: 'document', fileId, fileName: doc.file_name, mimeType: doc.mime_type, size: doc.document?.size };
    } else if (content._ === 'messageAudio') {
      contentType = 'audio';
      text = content.caption?.text || '';
      entities = captionEntities.map((e: any) => ({
        offset: e.offset,
        length: e.length,
        type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
        url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
      }));
      const audio = content.audio || {};
      const fileId = audio.audio?.id;
      if (fileId) fileIds.push(fileId);
      media = { type: 'audio', fileId, title: audio.title, performer: audio.performer, duration: audio.duration };
    } else if (content._ === 'messageVoiceNote') {
      contentType = 'voice';
      text = content.caption?.text || '';
      entities = captionEntities.map((e: any) => ({
        offset: e.offset,
        length: e.length,
        type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
        url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
      }));
      const voice = content.voice_note || {};
      const fileId = voice.voice?.id;
      if (fileId) fileIds.push(fileId);
      media = { type: 'voice', fileId, duration: voice.duration, waveform: voice.waveform };
    } else if (content._ === 'messageVideoNote') {
      contentType = 'videoNote';
      text = content.caption?.text || '';
      entities = captionEntities.map((e: any) => ({
        offset: e.offset,
        length: e.length,
        type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
        url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
      }));
      const vn = content.video_note || {};
      const fn = vn.video?.id;
      if (fn) fileIds.push(fn);
      media = { type: 'videoNote', fileId: fn, duration: vn.duration, size: vn.length || 200, thumbnail: vn.minithumbnail || vn.thumbnail?.sizes?.[0] };
    } else if (content._ === 'messageAnimation') {
      contentType = 'animation';
      text = content.caption?.text || '';
      entities = captionEntities.map((e: any) => ({
        offset: e.offset,
        length: e.length,
        type: e.type?._?.replace('textEntityType', '').toLowerCase() || '',
        url: e.type?._ === 'textEntityTypeTextUrl' ? e.type.url : undefined,
      }));
      const anim = content.animation || {};
      const fileId = anim.animation?.id;
      if (fileId) fileIds.push(fileId);
      media = { type: 'animation', fileId, width: anim.width, height: anim.height, mimeType: anim.mime_type, thumbnail: anim.minithumbnail || anim.thumbnail?.sizes?.[0] };
    } else if (content._ === 'messageSticker') {
      contentType = 'sticker';
      const sticker = content.sticker || {};
      const fileId = sticker.sticker?.id;
      if (fileId) fileIds.push(fileId);
      const format = sticker.format?._?.replace('stickerFormat', '').toLowerCase() || '';
      media = { type: 'sticker', fileId, width: sticker.width, height: sticker.height, emoji: sticker.emoji, format };
    } else if (content._ === 'messageText') {
      contentType = 'text';
    } else if (content._ === 'messageChatAddMembers') {
      contentType = 'service';
      const ids = content.chat_add_members?.member_user_ids || [];
      text = ids.length === 1 ? 'User joined the group' : `${ids.length} members joined the group`;
    } else if (content._ === 'messageChatJoinByLink') {
      contentType = 'service';
      text = 'User joined via invite link';
    } else if (content._ === 'messageChatDeleteMember') {
      contentType = 'service';
      text = 'User left the group';
    } else if (content._ === 'messageChatCreate' || content._ === 'messageBasicGroupCreate') {
      contentType = 'service';
      text = content.title ? `Group "${content.title}" created` : 'Group created';
    } else if (content._ === 'messageChatChangeTitle') {
      contentType = 'service';
      text = content.title ? `Group name changed to "${content.title}"` : 'Group name changed';
    } else if (content._ === 'messageChatChangePhoto') {
      contentType = 'service';
      text = 'Group photo changed';
    } else if (content._ === 'messageChatDeletePhoto') {
      contentType = 'service';
      text = 'Group photo removed';
    } else if (content._ === 'messagePinMessage') {
      contentType = 'service';
      text = 'Message pinned';
    } else if (content._ === 'messageChatUpgrade' || content._ === 'messageChatUpgradeFrom') {
      contentType = 'service';
      text = 'Group upgraded';
    } else if (content._ === 'messageContactRegistered') {
      contentType = 'service';
      text = 'User joined Telegram';
    } else {
      contentType = content._?.replace('message', '').toLowerCase() || 'unknown';
    }
    const replyTo = msg.reply_to;
    const replyToMsgId = replyTo?.message_id;
    const sendingState = msg.sending_state?._;
    return {
      id: msg.id,
      chatId: msg.chat_id,
      senderIsChat: !!msg.sender_id?.chat_id,
      senderId: msg.sender_id?.user_id || msg.sender_id?.chat_id || 0,
      text,
      isOutgoing: msg.is_outgoing,
      date: msg.date,
      forwardInfo: msg.forward_info || undefined,
      contentType,
      photoFileId,
      photoWidth,
      photoHeight,
      replyToMsgId,
      media,
      fileIds: fileIds.length ? fileIds : undefined,
      filePaths: undefined,
      entities: entities.length ? entities : undefined,
      serviceText: contentType === 'service' ? text : undefined,
      sendingState,
    };
  };

  const getSenderName = (msg: Message): string => {
    if (msg.senderIsChat) {
      const chat = chats.find(c => c.id === msg.senderId);
      return chat?.title || '...';
    }
    const u = users[msg.senderId];
    if (u) return `${u.firstName} ${u.lastName}`.trim() || 'Unknown';
    return '...';
  };

  const renderText = (text: string, entities?: Array<{ offset: number; length: number; type: string; url?: string }>): any[] => {
    if (!entities?.length) return [text];
    const sorted = [...entities].sort((a, b) => a.offset - b.offset);
    const parts: any[] = [];
    let pos = 0;
    for (const ent of sorted) {
      if (ent.offset > pos) parts.push(text.slice(pos, ent.offset));
      const entityText = text.slice(ent.offset, ent.offset + ent.length);
      if (ent.type === 'url' || ent.type === 'textUrl') {
        const href = ent.url || entityText;
        parts.push(createElement('a', { key: ent.offset, href, onClick: (e: any) => { e.preventDefault(); window.tdlib.shell.openUrl(href); } }, entityText));
      } else if (ent.type === 'email') {
        parts.push(createElement('a', { key: ent.offset, href: 'mailto:' + entityText, onClick: (e: any) => { e.preventDefault(); window.tdlib.shell.openUrl('mailto:' + entityText); } }, entityText));
      } else if (ent.type === 'bold') {
        parts.push(createElement('strong', { key: ent.offset }, entityText));
      } else if (ent.type === 'italic') {
        parts.push(createElement('em', { key: ent.offset }, entityText));
      } else if (ent.type === 'underline') {
        parts.push(createElement('u', { key: ent.offset }, entityText));
      } else if (ent.type === 'strikethrough') {
        parts.push(createElement('s', { key: ent.offset }, entityText));
      } else if (ent.type === 'code') {
        parts.push(createElement('code', { key: ent.offset }, entityText));
      } else if (ent.type === 'pre') {
        parts.push(createElement('pre', { key: ent.offset }, entityText));
      } else if (ent.type === 'mention') {
        parts.push(createElement('span', { key: ent.offset, className: 'entity-mention' }, entityText));
      } else if (ent.type === 'hashtag') {
        parts.push(createElement('span', { key: ent.offset, className: 'entity-hashtag' }, entityText));
      } else if (ent.type === 'bankCard') {
        parts.push(createElement('span', { key: ent.offset }, entityText));
      } else if (ent.type === 'phoneNumber') {
        parts.push(createElement('a', { key: ent.offset, href: 'tel:' + entityText, onClick: (e: any) => { e.preventDefault(); window.tdlib.shell.openUrl('tel:' + entityText); } }, entityText));
      } else {
        parts.push(entityText);
      }
      pos = ent.offset + ent.length;
    }
    if (pos < text.length) parts.push(text.slice(pos));
    return parts;
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  const formatDuration = (seconds: number): string => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  };

  const downloadFileById = (msgId: number, fileId: number) => {
    window.tdlib.files.downloadFile(fileId).then((file: any) => {
      if (file?.local?.is_downloading_completed && file.local.path) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, filePaths: { ...(m.filePaths || {}), [fileId]: file.local.path } } : m));
      }
    }).catch((e: any) => { console.error('downloadFileById error:', e); });
  };

  const downloadPhoto = (msgId: number, fileId: number) => {
    window.tdlib.files.downloadFile(fileId).then((file: any) => {
      if (file?.local?.is_downloading_completed && file.local.path) {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, photoPath: file.local.path } : m));
      }
    }).catch(() => {});
  };

  const loadOlderMessages = async () => {
    if (!selectedChatId || loadingOlderRef.current || !hasMoreRef.current) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const el = messagesRef.current;
      const prevScrollHeight = el?.scrollHeight || 0;
      const prevScrollTop = el?.scrollTop || 0;
      const oldestId = messages.length > 0 ? messages[0].id : 0;
      const result = await window.tdlib.send({
        _: 'getChatHistory',
        chat_id: selectedChatId,
        from_message_id: oldestId,
        offset: 0,
        limit: 50,
        only_local: false,
      });
      const raw = ((result as any).messages || []);
      const newMsgs = raw.map(formatMessage).reverse();
      if (newMsgs.length === 0) { hasMoreRef.current = false; }
      if (newMsgs.length > 0) {
        setMessages(prev => {
          const existing = new Set(prev.map(m => m.id));
          const unique = newMsgs.filter(m => !existing.has(m.id));
          return unique.length ? [...unique, ...prev] : prev;
        });
        newMsgs.forEach((m: Message) => {
          if (m.photoFileId) downloadPhoto(m.id, m.photoFileId);
          if (m.fileIds) m.fileIds.forEach(fid => { if (fid !== m.photoFileId) downloadFileById(m.id, fid); });
        });
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevScrollHeight + prevScrollTop;
        });
      }
    } catch (e) {
      console.error('loadOlderMessages error:', e);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  const handleScrollMessages = () => {
    const el = messagesRef.current;
    if (!el || loadingOlderRef.current || !hasMoreRef.current) return;
    if (el.scrollTop <= 50) loadOlderMessages();
  };

  const getForwardName = (fi: any): string | null => {
    const origin = fi.origin;
    if (origin._ === 'messageOriginUser') {
      if (origin.sender_name) return origin.sender_name;
      const u = users[origin.sender_user_id];
      if (u) return `${u.firstName} ${u.lastName}`.trim() || null;
      return null;
    }
    if (origin._ === 'messageOriginHiddenUser') return origin.sender_name || 'Hidden User';
    if (origin._ === 'messageOriginChat') {
      const chat = chats.find(c => c.id === origin.sender_chat_id);
      return chat?.title || origin.author_signature || 'Group';
    }
    if (origin._ === 'messageOriginChannel') {
      const chat = chats.find(c => c.id === origin.chat_id);
      return chat?.title || origin.author_signature || 'Channel';
    }
    return null;
  };

  const handleSendPhone = async () => {
    setError(''); setLoading(true);
    try { await window.tdlib.auth.sendPhone(phoneNumber); }
    catch (e: any) { setError(e.message || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleSendCode = async () => {
    setError(''); setLoading(true);
    try { await window.tdlib.auth.sendCode(code); }
    catch (e: any) { setError(e.message || 'Invalid code'); }
    finally { setLoading(false); }
  };

  const handleSendPassword = async () => {
    setError(''); setLoading(true);
    try { await window.tdlib.auth.sendPassword(password); }
    catch (e: any) { setError(e.message || 'Invalid password'); }
    finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setError(''); setLoading(true);
    try { await window.tdlib.auth.register(firstName, lastName); }
    catch (e: any) { setError(e.message || 'Registration failed'); }
    finally { setLoading(false); }
  };

  const handleSelectChat = async (chatId: number) => {
    setSelectedChatId(chatId);
    setMessages([]);
    setError('');
    try {
      await window.tdlib.send({ _: 'openChat', chat_id: chatId });
      const chat = chats.find(c => c.id === chatId);
      if (chat?.lastMessageId) {
        window.tdlib.send({ _: 'viewMessages', chat_id: chatId, message_ids: [chat.lastMessageId], force_read: true }).catch(() => {});
      }
      let result = await window.tdlib.send({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: 0,
        offset: 0,
        limit: 50,
        only_local: false,
      });
      let retries = 5;
      while ((result as any).total_count === 1 && retries > 0) {
        await new Promise(r => setTimeout(r, 1000));
        result = await window.tdlib.send({
          _: 'getChatHistory',
          chat_id: chatId,
          from_message_id: 0,
          offset: 0,
          limit: 50,
          only_local: false,
        });
        retries--;
      }
      if ((result as any).total_count != null) {
        let msgs = ((result as any).messages || []).reverse().map(formatMessage);
        const readId = lastReadOutboxRef.current[chatId] || 0;
        if (readId) msgs = msgs.map(m => m.isOutgoing ? { ...m, isRead: m.id <= readId } : m);
        setMessages(msgs);
        setTimeout(() => {
          if (messagesRef.current && selectedChatIdRef.current === chatId) {
            messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
          }
        }, 0);
        const unknownIds = [...new Set(msgs.filter(m => !m.senderIsChat && m.senderId && currentUser?.id !== m.senderId).map(m => m.senderId))];
        unknownIds.forEach(id => {
          window.tdlib.send({ _: 'getUser', user_id: id }).then((user: any) => {
            if (user?.id) setUsers(prev => ({ ...prev, [user.id]: { firstName: user.first_name || '', lastName: user.last_name || '' } }));
          }).catch(() => {});
        });
        msgs.forEach(m => {
          if (m.photoFileId) downloadPhoto(m.id, m.photoFileId);
          if (m.fileIds) m.fileIds.forEach(fid => { if (fid !== m.photoFileId) downloadFileById(m.id, fid); });
        });
      }
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c));
    } catch (e) {
      console.error('getChatHistory error:', e);
      setError('Failed to load messages');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChatId) return;
    const text = newMessage.trim();
    const replyId = replyToId;
    setNewMessage('');
    setReplyToId(null);
    try { await window.tdlib.chats.sendMessage(selectedChatId, text, replyId || undefined); }
    catch { setNewMessage(text); }
  };

  const filteredChats = chats.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authState !== 'ready') {
    return createElement(AuthScreen, {
      authState, phoneNumber, setPhoneNumber, code, setCode,
      password, setPassword, firstName, setFirstName, lastName, setLastName,
      error, loading,
      onSendPhone: handleSendPhone, onSendCode: handleSendCode,
      onSendPassword: handleSendPassword, onRegister: handleRegister
    });
  }

  return createElement('div', { className: `app${darkMode ? ' dark' : ''}` },
    menuOpen && createElement('div', { className: 'menu-overlay', onClick: () => setMenuOpen(false) }),
    createElement('div', { className: `sidebar ${menuOpen ? 'menu-open' : ''}` },
      createElement('div', { className: 'sidebar-header' },
        createElement('button', { className: 'menu-btn', onClick: () => setMenuOpen(v => !v) },
          createElement('svg', { width: '22', height: '22', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
            createElement('line', { x1: '3', y1: '6', x2: '21', y2: '6' }),
            createElement('line', { x1: '3', y1: '12', x2: '21', y2: '12' }),
            createElement('line', { x1: '3', y1: '18', x2: '21', y2: '18' })
          )
        ),
        createElement('h1', null, 'Telega')
      ),
      createElement('div', { className: 'menu-panel' },
        createElement('div', { className: 'menu-user' },
          createElement('img', { src: currentUser?.profile_photo?.small?.local?.path ? toFileUrl(currentUser.profile_photo.small.local.path) : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="%23e8f0fe"/><text x="50" y="60" text-anchor="middle" font-size="40" fill="%231a73e8">' + (currentUser?.first_name?.[0] || '?') + '</text></svg>', className: 'menu-user-avatar' }),
          createElement('div', { className: 'menu-user-info' },
            createElement('div', { className: 'menu-user-name' }, [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || 'User'),
            createElement('div', { className: 'menu-user-phone' }, currentUser?.phone || '')
          )
        ),
        createElement('div', { className: 'menu-items' },
          createElement('div', { className: 'menu-item', onClick: toggleDark },
            createElement('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
              darkMode
                ? createElement('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' })
                : createElement('path', { d: 'M12 3a6 6 0 0 0 9 9 6 6 0 1 1-9-9' })
            ),
            createElement('span', null, darkMode ? 'Light Mode' : 'Dark Mode')
          ),
          createElement('div', { className: 'menu-item', onClick: () => { window.tdlib.profile.logout().then(() => { setAuthState('waitPhoneNumber'); setChats([]); setMessages([]); setCurrentUser(null); setSelectedChatId(null); setMenuOpen(false); }).catch(() => {}); } },
            createElement('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
              createElement('path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }),
              createElement('polyline', { points: '16 17 21 12 16 7' }),
              createElement('line', { x1: '21', y1: '12', x2: '9', y2: '12' })
            ),
            createElement('span', null, 'Log Out')
          )
        )
      ),
      createElement('div', { className: 'search-bar' },
        createElement('input', { type: 'text', placeholder: 'Search', value: searchQuery, onChange: (e: any) => setSearchQuery(e.target.value) })
      ),
      createElement('div', { className: 'chat-list', ref: chatListRef },
        filteredChats.map(chat =>
          createElement('div', {
            key: chat.id,
            className: `chat-item ${selectedChatId === chat.id ? 'active' : ''}`,
            onClick: () => handleSelectChat(chat.id)
          },
            renderAvatar(chat),
            createElement('div', { className: 'chat-info' },
              createElement('div', { className: 'chat-header' },
                createElement('span', { className: 'chat-name' }, chat.title),
                createElement('span', { className: 'chat-time' }, formatTime(chat.lastMessageTime))
              ),
              createElement('div', { className: `chat-preview ${chat.unreadCount > 0 ? 'unread' : ''}` },
                chat.lastMessage || 'No messages yet',
                chat.unreadCount > 0 && createElement('span', { className: 'unread-badge' }, chat.unreadCount > 99 ? '99+' : chat.unreadCount)
              )
            )
          )
        ),
        filteredChats.length === 0 && createElement('div', { className: 'empty-chat' }, 'No chats found')
      )
    ),
    selectedChatId ? (
      createElement('div', { className: 'chat-area' },
        createElement('div', { className: 'chat-header' },
          renderAvatar(chats.find(c => c.id === selectedChatId)!, 40),
          createElement('div', null,
            createElement('div', { className: 'chat-name' }, chats.find(c => c.id === selectedChatId)?.title),
            createElement('div', { className: 'chat-type-label' }, (() => {
              const chat = chats.find(c => c.id === selectedChatId);
              if (!chat) return '';
              switch (chat.chatType) {
                case 'channel': return 'Channel';
                case 'group': return 'Group';
                case 'secret': return 'Secret Chat';
                default: return 'Private';
              }
            })())
          )
        ),
        createElement('div', { className: 'messages', ref: messagesRef, onScroll: handleScrollMessages },
          messages.length === 0 && chats.find(c => c.id === selectedChatId)?.chatType === 'channel'
            ? createElement('div', { className: 'channel-empty' },
                createElement('div', { className: 'channel-empty-icon' },
                  createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
                    createElement('path', { d: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' })
                  )
                ),
                createElement('h3', null, 'Channel'),
                createElement('p', null, 'Messages from the channel will appear here')
              )
            : null,
          loadingOlder && createElement('div', { className: 'loading-older', key: 'loading-older' }, 'Loading older messages...'),
          (() => {
            const selectedChat = chats.find(c => c.id === selectedChatId);
            const isGroupOrChannel = selectedChat && (selectedChat.chatType === 'group' || selectedChat.chatType === 'channel');
            const chatMessages = messages.filter(m => m.chatId === selectedChatId);
            const result: any[] = [];
            chatMessages.forEach((msg, i) => {
              const prev = i > 0 ? chatMessages[i - 1] : null;
              const sameAuthor = prev && prev.senderId === msg.senderId;
              const showAuthorHeader = isGroupOrChannel && !msg.isOutgoing && !sameAuthor;
              const isStacked = isGroupOrChannel && !msg.isOutgoing && !!sameAuthor;
              if (!prev || !sameDay(prev.date, msg.date)) {
                result.push(createElement('div', { key: 'date-' + msg.id, className: 'date-separator' },
                  createElement('span', { className: 'date-separator-text' }, formatDate(msg.date))
                ));
              }
              if (msg.contentType === 'service') {
                result.push(createElement('div', { key: msg.id, className: 'message-service' },
                  createElement('div', { className: 'message-service-text' }, msg.serviceText || msg.text)
                ));
                return;
              }
              const statusIcon = msg.isOutgoing && !msg.sendingState
                ? createElement('span', { className: 'message-status' },
                    msg.isRead
                      ? createElement('svg', { width: '20', height: '14', viewBox: '0 0 20 14', fill: 'none', stroke: '#53bdeb', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
                          createElement('path', { d: 'M1 7l3 3 5-5' }),
                          createElement('path', { d: 'M7 7l3 3 5-5' })
                        )
                      : createElement('svg', { width: '16', height: '14', viewBox: '0 0 16 14', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round' },
                          createElement('path', { d: 'M3 7l3 3 5-5' })
                        )
                  )
                : null;
              result.push(createElement('div', {
                key: msg.id,
                className: `message-row ${msg.isOutgoing ? 'outgoing' : 'incoming'} ${isStacked ? 'stacked' : ''}`
              },
                showAuthorHeader && createElement('div', { className: 'message-sender' }, getSenderName(msg)),
                createElement('div', {
                  className: `message ${msg.isOutgoing ? 'outgoing' : 'incoming'} ${isStacked && !msg.isOutgoing ? 'message-stacked' : ''}`,
                },
                  createElement('div', { className: 'message-bubble' },
                    msg.replyToMsgId ? (() => {
                      const replied = chatMessages.find(m => m.id === msg.replyToMsgId);
                      return createElement('div', { className: 'message-reply' },
                        createElement('div', { className: 'message-reply-line' }),
                        createElement('div', { className: 'message-reply-content' },
                          createElement('div', { className: 'message-reply-sender' }, replied ? getSenderName(replied) : '...'),
                          createElement('div', { className: 'message-reply-text' }, replied?.text || 'Message not found')
                        )
                      );
                    })() : null,
                    msg.forwardInfo && createElement('div', { className: 'message-forward' }, 'Forwarded from ' + (getForwardName(msg.forwardInfo) || '...')),
                    msg.contentType === 'photo'
                      ? (msg.photoPath
                          ? createElement('img', { src: toFileUrl(msg.photoPath), className: 'message-photo', style: msg.photoWidth ? { maxWidth: Math.min(msg.photoWidth, 300), maxHeight: Math.min(msg.photoHeight || 300, 300) } : {}, onClick: () => setPreviewPhoto(msg.photoPath!) })
                          : createElement('div', { className: 'message-photo-loading' }, 'Photo loading...'))
                      : msg.contentType === 'video'
                        ? createElement('div', { className: 'message-video' },
                            msg.filePaths?.[msg.media?.fileId]
                              ? createElement('video', { src: toFileUrl(msg.filePaths[msg.media.fileId]), controls: true, className: 'message-video-player', style: { maxWidth: 300, maxHeight: 300 } })
                              : createElement('div', { className: 'message-media-loading' },
                                  createElement('span', null, 'Video ' + (msg.media?.duration ? formatDuration(msg.media.duration) : '')),
                                  createElement('span', { className: 'media-download-hint' }, ' — click to load')
                                )
                          )
                        : msg.contentType === 'document'
                          ? createElement('div', { className: 'message-document' },
                              createElement('div', { className: 'message-document-icon' },
                                createElement('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                                  createElement('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
                                  createElement('polyline', { points: '14 2 14 8 20 8' })
                                )
                              ),
                              createElement('div', { className: 'message-document-info' },
                                createElement('div', { className: 'message-document-name' }, msg.media?.fileName || 'Document'),
                                msg.media?.size ? createElement('div', { className: 'message-document-size' }, formatFileSize(msg.media.size)) : null
                              )
                            )
                          : msg.contentType === 'audio'
                            ? createElement('div', { className: 'message-audio' },
                                msg.filePaths?.[msg.media?.fileId]
                                  ? createElement('audio', { src: toFileUrl(msg.filePaths[msg.media.fileId]), controls: true, className: 'message-audio-player', preload: 'metadata' })
                                  : createElement('div', { className: 'message-media-loading' },
                                      createElement('span', null, msg.media?.title || 'Audio ' + (msg.media?.duration ? formatDuration(msg.media.duration) : '')),
                                      createElement('span', { className: 'media-download-hint' }, ' — loading')
                                    )
                              )
                            : msg.contentType === 'voice'
                              ? createElement('div', { className: 'message-voice' },
                                  msg.filePaths?.[msg.media?.fileId]
                                    ? createElement('audio', { src: toFileUrl(msg.filePaths[msg.media.fileId]), controls: true, className: 'message-voice-player', preload: 'metadata' })
                                    : createElement('div', { className: 'message-media-loading' },
                                        createElement('span', null, msg.media?.duration ? formatDuration(msg.media.duration) : 'Voice'),
                                        createElement('span', { className: 'media-download-hint' }, ' — loading')
                                      )
                                )
                              : msg.contentType === 'animation'
                                ? createElement('div', { className: 'message-animation' },
                                    msg.filePaths?.[msg.media?.fileId]
                                      ? createElement('video', { src: toFileUrl(msg.filePaths[msg.media.fileId]), autoPlay: true, loop: true, muted: true, className: 'message-animation-video', style: { maxWidth: 200, maxHeight: 200 } })
                                      : createElement('div', { className: 'message-media-loading' }, createElement('span', null, 'GIF loading...'))
                                  )
                                : msg.contentType === 'videoNote'
                                  ? createElement('div', { className: 'message-videonote' },
                                      msg.filePaths?.[msg.media?.fileId]
                                        ? createElement('video', { src: toFileUrl(msg.filePaths[msg.media.fileId]), controls: true, className: 'message-videonote-player', style: { width: msg.media?.size || 200, height: msg.media?.size || 200 } })
                                        : createElement('div', { className: 'message-videonote-loading', style: { width: msg.media?.size || 200, height: msg.media?.size || 200 } },
                                            createElement('span', null, 'Video note ' + (msg.media?.duration ? formatDuration(msg.media.duration) : ''))
                                          )
                                    )
                                  : msg.contentType === 'sticker'
                                    ? (msg.filePaths?.[msg.media?.fileId]
                                        ? (msg.media?.format === 'webm'
                                            ? createElement('video', { src: toFileUrl(msg.filePaths[msg.media.fileId]), autoPlay: true, loop: true, muted: true, className: 'message-sticker-video', style: { width: 120, height: 120 } })
                                            : createElement('img', { src: toFileUrl(msg.filePaths[msg.media.fileId]), className: 'message-sticker-img' }))
                                        : createElement('div', { className: 'message-media-loading' }, createElement('span', null, msg.media?.emoji || 'Sticker')))
                                    : msg.contentType !== 'text'
                                      ? createElement('div', { className: 'message-media-label' }, msg.contentType)
                                      : null,
                    msg.text ? createElement('div', { className: msg.contentType === 'photo' || msg.contentType === 'video' || msg.contentType === 'videoNote' || msg.contentType === 'document' || msg.contentType === 'audio' || msg.contentType === 'voice' || msg.contentType === 'animation' ? 'message-caption' : '' }, ...renderText(msg.text, msg.entities)) : null,
                    createElement('div', { className: 'message-time' },
                      formatMsgTime(msg.date),
                      statusIcon
                    )
                  ),
                  createElement('button', {
                    className: 'message-reply-btn',
                    title: 'Reply',
                    onClick: (e: any) => { e.stopPropagation(); setReplyToId(msg.id); }
                  },
                    createElement('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                      createElement('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
                    )
                  )
                )
              ));
            });
            return result;
          })(),
          createElement('div', { ref: messagesEndRef })
        ),
        (chats.find(c => c.id === selectedChatId)?.chatType !== 'channel')
          ? createElement('div', { className: 'input-area' },
              replyToId ? (() => {
                const replied = messages.find(m => m.chatId === selectedChatId && m.id === replyToId);
                const name = replied ? getSenderName(replied) : '...';
                return createElement('div', { className: 'reply-bar' },
                  createElement('div', { className: 'reply-bar-info' },
                    createElement('div', { className: 'reply-bar-name' }, 'Replying to ' + name),
                    createElement('div', { className: 'reply-bar-text' }, replied?.text || 'Message not found')
                  ),
                  createElement('button', { className: 'reply-bar-close', onClick: () => setReplyToId(null) },
                    createElement('svg', { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                      createElement('path', { d: 'M18 6L6 18M6 6l12 12' })
                    )
                  )
                );
              })() : null,
              createElement('form', { onSubmit: handleSendMessage, className: 'input-wrapper' },
                createElement('input', {
                  type: 'text',
                  placeholder: 'Message',
                  value: newMessage,
                  onChange: (e: any) => setNewMessage(e.target.value),
                  disabled: loading
                }),
                createElement('button', { type: 'submit', className: 'send-btn', disabled: loading || !newMessage.trim() },
                  createElement('svg', { width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                    createElement('path', { d: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' })
                  )
                )
              )
            )
          : null
      )
    ) : (
      createElement('div', { className: 'chat-area empty-chat' },
        createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5' },
          createElement('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
        ),
        createElement('h2', null, 'Select a chat'),
        createElement('p', null, 'Choose a conversation to start messaging')
      )
    ),
    previewPhoto && createElement('div', { className: 'photo-preview', onClick: () => setPreviewPhoto(null) },
      createElement('img', { src: toFileUrl(previewPhoto), className: 'photo-preview-img', onClick: (e: any) => e.stopPropagation() }),
      createElement('button', { className: 'photo-preview-close', onClick: () => setPreviewPhoto(null) },
        createElement('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'white', strokeWidth: '2' },
          createElement('line', { x1: '18', y1: '6', x2: '6', y2: '18' }),
          createElement('line', { x1: '6', y1: '6', x2: '18', y2: '18' })
        )
      )
    )
  );
}

function AuthScreen(props: any) {
  const { authState, phoneNumber, setPhoneNumber, code, setCode, password, setPassword, firstName, setFirstName, lastName, setLastName, error, loading, onSendPhone, onSendCode, onSendPassword, onRegister } = props;

  return createElement('div', { className: 'auth-screen' },
    createElement('div', { className: 'auth-container' },
      createElement('h1', null, 'Telega'),
      createElement('p', null, 'Telegram client built with Electron & TDLib'),
      error && createElement('div', { className: 'auth-error' }, error),
      authState === 'waitPhoneNumber' && createElement('div', null,
        createElement('div', { className: 'form-group' },
          createElement('label', null, 'Phone Number'),
          createElement('input', { type: 'tel', placeholder: '+1 234 567 890', value: phoneNumber, onChange: (e: any) => setPhoneNumber(e.target.value) })
        ),
        createElement('button', { className: 'btn btn-primary', onClick: onSendPhone, disabled: loading || !phoneNumber }, loading ? 'Sending...' : 'Next')
      ),
      authState === 'waitCode' && createElement('div', null,
        createElement('div', { className: 'form-group' },
          createElement('label', null, 'Authentication Code'),
          createElement('input', { type: 'text', placeholder: '12345', value: code, onChange: (e: any) => setCode(e.target.value), autoFocus: true })
        ),
        createElement('button', { className: 'btn btn-primary', onClick: onSendCode, disabled: loading || !code }, loading ? 'Verifying...' : 'Next')
      ),
      authState === 'waitPassword' && createElement('div', null,
        createElement('div', { className: 'form-group' },
          createElement('label', null, 'Two-Step Verification Password'),
          createElement('input', { type: 'password', placeholder: 'Enter password', value: password, onChange: (e: any) => setPassword(e.target.value), autoFocus: true })
        ),
        createElement('button', { className: 'btn btn-primary', onClick: onSendPassword, disabled: loading || !password }, loading ? 'Verifying...' : 'Login')
      ),
      authState === 'waitRegistration' && createElement('div', null,
        createElement('div', { className: 'form-group' },
          createElement('label', null, 'First Name'),
          createElement('input', { type: 'text', placeholder: 'John', value: firstName, onChange: (e: any) => setFirstName(e.target.value), autoFocus: true })
        ),
        createElement('div', { className: 'form-group' },
          createElement('label', null, 'Last Name (optional)'),
          createElement('input', { type: 'text', placeholder: 'Doe', value: lastName, onChange: (e: any) => setLastName(e.target.value) })
        ),
        createElement('button', { className: 'btn btn-primary', onClick: onRegister, disabled: loading || !firstName }, loading ? 'Registering...' : 'Register')
      ),
      authState === 'closed' && createElement('div', { className: 'loading' }, 'Loading...')
    )
  );
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  else if (diff < 604800000) return date.toLocaleDateString([], { weekday: 'short' });
  else return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMsgTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000 && date.getDate() === now.getDate()) return 'Today';
  if (diff < 172800000 && date.getDate() === now.getDate() - 1) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function sameDay(a: number, b: number): boolean {
  const da = new Date(a * 1000);
  const db = new Date(b * 1000);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

const root = createRoot(document.getElementById('root')!);
root.render(createElement(App));