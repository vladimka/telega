import { describe, it, expect } from 'vitest';
import { formatTime, filterChats, formatUnreadCount, getInitials, getAvatarColor } from './tdlib';

describe('Utility Functions', () => {
  describe('formatTime', () => {
    it('formats recent timestamps as time', () => {
      const now = Math.floor(Date.now() / 1000);
      expect(formatTime(now - 3600)).toMatch(/^\d{2}:\d{2}$/);
    });

    it('formats older timestamps as date', () => {
      const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
      expect(formatTime(weekAgo)).not.toMatch(/^\d{2}:\d{2}$/);
    });
  });

  describe('filterChats', () => {
    const mockChats = [
      { id: 1, title: 'John Doe', unread_count: 5 },
      { id: 2, title: 'Jane Smith', unread_count: 0 },
      { id: 3, title: 'Bob Wilson', unread_count: 3 },
    ];

    it('returns all chats when query is empty', () => {
      expect(filterChats(mockChats, '')).toEqual(mockChats);
    });

    it('filters chats by title', () => {
      expect(filterChats(mockChats, 'john')).toHaveLength(1);
    });

    it('filters chats case-insensitively', () => {
      expect(filterChats(mockChats, 'JANE')[0].title).toBe('Jane Smith');
    });

    it('returns empty array when no matches', () => {
      expect(filterChats(mockChats, 'xyz')).toEqual([]);
    });
  });

  describe('formatUnreadCount', () => {
    it('returns empty string for zero', () => expect(formatUnreadCount(0)).toBe(''));
    it('returns count for small numbers', () => expect(formatUnreadCount(5)).toBe('5'));
    it('returns 99+ for large numbers', () => expect(formatUnreadCount(100)).toBe('99+'));
  });

  describe('getInitials', () => {
    it('returns first two initials', () => expect(getInitials('John Doe')).toBe('JD'));
    it('handles single name', () => expect(getInitials('John')).toBe('J'));
  });

  describe('getAvatarColor', () => {
    it('returns consistent color for same name', () => {
      expect(getAvatarColor('John')).toBe(getAvatarColor('John'));
    });
    it('returns valid hex color', () => {
      expect(getAvatarColor('Test')).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});