import { pb, sortByDateDesc, withAuthRefresh } from '../lib/pb';

export function createReport(data: {
  reporter: string;
  type: 'message' | 'user' | 'sighting' | 'comment';
  target_id: string;
  reason: string;
  content?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
}) {
  return withAuthRefresh(() => pb.collection('reports').create(data));
}

export function listAdminReports() {
  return withAuthRefresh(async () => sortByDateDesc(await pb.collection('reports').getFullList({ expand: 'reporter' })));
}
