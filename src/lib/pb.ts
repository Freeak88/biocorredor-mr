import PocketBase from 'pocketbase';

export const pb = new PocketBase(window.location.origin);

// Disable auto-cancellation to prevent conflicts between realtime subscriptions and CRUD operations
pb.autoCancellation(false);

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

export function isAuthError(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return status === 401 || status === 403;
}

export async function refreshAuth(): Promise<boolean> {
  if (!pb.authStore.record) return false;
  try {
    await pb.collection('users').authRefresh();
    return pb.authStore.isValid;
  } catch (error) {
    pb.authStore.clear();
    return false;
  }
}

export async function withAuthRefresh<T>(operation: () => Promise<T>): Promise<T> {
  if (pb.authStore.record && !pb.authStore.isValid) {
    await refreshAuth();
  }
  try {
    return await operation();
  } catch (error) {
    if (!isAuthError(error)) throw error;
    const refreshed = await refreshAuth();
    if (!refreshed) throw error;
    return operation();
  }
}
