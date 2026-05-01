import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from '../../hooks/useAuth';

const pbMock = vi.hoisted(() => ({
  authStore: {
    isValid: false,
    record: null as any,
    clear: vi.fn(),
    onChange: vi.fn(),
  },
  collection: vi.fn(),
  files: { getURL: vi.fn(() => 'avatar-url') },
}));

vi.mock('../../lib/pb', () => ({
  pb: pbMock,
}));

describe('useAuth with PocketBase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pbMock.authStore.isValid = false;
    pbMock.authStore.record = null;
    pbMock.authStore.onChange.mockReturnValue(vi.fn());
  });

  it('restores a valid PocketBase session', async () => {
    pbMock.authStore.isValid = true;
    pbMock.authStore.record = { id: 'u1', email: 'test@example.com', name: 'Explorer' };

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toMatchObject({
      uid: 'u1',
      email: 'test@example.com',
      displayName: 'Explorer',
    });
  });

  it('registers a user with role, points and merits', async () => {
    const create = vi.fn().mockResolvedValue({});
    const authWithPassword = vi.fn().mockResolvedValue({});
    pbMock.collection.mockReturnValue({ create, authWithPassword });

    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.handleRegister('new@example.com', 'secret123', 'New Explorer');
    });

    expect(create).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'secret123',
      passwordConfirm: 'secret123',
      name: 'New Explorer',
      role: 'user',
      points: 0,
      merits: [],
    });
    expect(authWithPassword).toHaveBeenCalledWith('new@example.com', 'secret123');
  });

  it('clears PocketBase auth on logout', async () => {
    const { result } = renderHook(() => useAuth());
    await act(async () => {
      await result.current.handleLogout();
    });
    expect(pbMock.authStore.clear).toHaveBeenCalled();
  });
});
