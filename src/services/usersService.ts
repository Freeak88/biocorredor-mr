import { pb, withAuthRefresh } from '../lib/pb';

export function updateUserProfile(id: string, data: Record<string, unknown>) {
  return withAuthRefresh(() => pb.collection('users').update(id, data));
}

export function listAdminUsers() {
  return withAuthRefresh(() => pb.collection('users').getFullList({ sort: '-last_seen' }));
}
