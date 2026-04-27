import PocketBase from 'pocketbase';

export const pb = new PocketBase(window.location.origin);

// ── Helper functions ──

export function getFileURL(record: Record<string, any>, filename: string): string {
  return pb.files.getURL(record, filename);
}

export function getCurrentUser() {
  return pb.authStore.record;
}

export function isAuthenticated(): boolean {
  return pb.authStore.isValid;
}

export function isAdmin(): boolean {
  return pb.authStore.record?.role === 'admin';
}
