import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSightings } from '../../hooks/useSightings';

const pbMock = vi.hoisted(() => ({
  collection: vi.fn(),
  files: { getURL: vi.fn(() => 'file-url') },
}));

vi.mock('../../lib/pb', () => ({
  pb: pbMock,
  getFileURL: vi.fn(() => 'file-url'),
}));

describe('useSightings viewport loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    pbMock.collection.mockReturnValue({
      getList: vi.fn().mockResolvedValue({ items: [] }),
      subscribe: vi.fn().mockResolvedValue(vi.fn()),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('does not load sightings before map bounds exist', async () => {
    const getList = vi.fn().mockResolvedValue({ items: [] });
    pbMock.collection.mockReturnValue({ getList, subscribe: vi.fn().mockResolvedValue(vi.fn()), unsubscribe: vi.fn().mockResolvedValue(undefined) });

    renderHook(() => useSightings('u1'));

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getList).not.toHaveBeenCalled();
  });

  it('loads sightings using a PocketBase lat/lng viewport filter', async () => {
    const getList = vi.fn().mockResolvedValue({
      items: [{ id: 's1', mushroom_name: 'Amanita', description: 'test', lat: -34.6, lng: -58.3, user: 'u1', status: 'unconfirmed', images: [] }],
    });
    pbMock.collection.mockReturnValue({ getList, subscribe: vi.fn().mockResolvedValue(vi.fn()), unsubscribe: vi.fn().mockResolvedValue(undefined) });

    const { result } = renderHook(() => useSightings('u1'));
    act(() => {
      result.current.setMapBounds({
        northEast: { lat: -34, lng: -58 },
        southWest: { lat: -35, lng: -59 },
      });
    });

    await waitFor(() => expect(result.current.sightings).toHaveLength(1));
    expect(getList).toHaveBeenCalledWith(1, 500, expect.objectContaining({
      sort: '-created',
      expand: 'user',
      filter: expect.stringContaining('lat >= -35 && lat <= -34'),
    }));
  });
});
