import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../../hooks/useChat';

const pbMock = vi.hoisted(() => ({
  collection: vi.fn(),
  files: { getURL: vi.fn(() => 'avatar-url') },
}));

const withAuthRefreshMock = vi.hoisted(() => vi.fn((operation: () => Promise<unknown>) => operation()));

vi.mock('../../lib/pb', () => ({
  pb: pbMock,
  getFileURL: vi.fn(() => 'avatar-url'),
  sortByDateDesc: vi.fn((records: any[]) => records),
  withAuthRefresh: withAuthRefreshMock,
}));

describe('useChat with PocketBase', () => {
  const user = { uid: 'u1', email: 'a@b.com', displayName: 'Explorer', photoURL: null, isAnonymous: false as const };

  beforeEach(() => {
    vi.clearAllMocks();
    pbMock.collection.mockReturnValue({
      getList: vi.fn().mockResolvedValue({ items: [] }),
      subscribe: vi.fn().mockResolvedValue(vi.fn()),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({}),
    });
  });

  it('loads the latest chat messages from PocketBase', async () => {
    const getList = vi.fn().mockResolvedValue({
      items: [{ id: 'm1', user: 'u2', text: 'hola', lat: 1, lng: 2, expand: { user: { name: 'Ana' } } }],
    });
    pbMock.collection.mockReturnValue({ getList, subscribe: vi.fn().mockResolvedValue(vi.fn()), unsubscribe: vi.fn().mockResolvedValue(undefined) });

    const { result } = renderHook(() => useChat(user, [1, 2]));

    await waitFor(() => expect(result.current.chatMessages).toHaveLength(1));
    expect(getList).toHaveBeenCalledWith(1, 200, { expand: 'user' });
  });

  it('sends required user relation with chat message', async () => {
    const create = vi.fn().mockResolvedValue({});
    pbMock.collection.mockReturnValue({
      getList: vi.fn().mockResolvedValue({ items: [] }),
      subscribe: vi.fn().mockResolvedValue(vi.fn()),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      create,
    });

    const { result } = renderHook(() => useChat(user, [10, 20]));
    await act(async () => {
      await result.current.handleSendMessage('mensaje');
    });

    expect(create).toHaveBeenCalledWith({
      user: 'u1',
      text: 'mensaje',
      lat: 10,
      lng: 20,
    });
  });
});
