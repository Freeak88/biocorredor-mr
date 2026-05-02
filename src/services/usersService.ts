import { pb, sortByDateDesc, withAuthRefresh } from '../lib/pb';

export function updateUserProfile(id: string, data: Record<string, unknown>) {
  return withAuthRefresh(() => pb.collection('users').update(id, data));
}

export function listAdminUsers() {
  return withAuthRefresh(async () => sortByDateDesc(await pb.collection('users').getFullList(), 'last_seen'));
}
