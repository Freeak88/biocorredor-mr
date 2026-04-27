import { vi } from 'vitest';
import type { User, Auth } from 'firebase/auth';
import type { Firestore, DocumentReference, DocumentSnapshot, QuerySnapshot, QueryDocumentSnapshot, CollectionReference, Query, Unsubscribe } from 'firebase/firestore';

// ─── Auth Mocks ──────────────────────────────────────────────

export const mockAuth: Partial<Auth> = {
  currentUser: null,
};

export const mockUser: User = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test Explorer',
  photoURL: 'https://example.com/avatar.png',
  emailVerified: true,
  isAnonymous: false,
  metadata: {} as any,
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: vi.fn(),
  getIdToken: vi.fn(() => Promise.resolve('mock-token')),
  getIdTokenResult: vi.fn(),
  reload: vi.fn(),
  toJSON: vi.fn(),
  phoneNumber: null,
  providerId: 'google.com',
};

export const mockAdminUser: User = {
  ...mockUser,
  uid: 'admin-456',
  email: 'DamianFerraro@gmail.com',
  displayName: 'Admin User',
};

export const mockUnsubscribeAuth = vi.fn();

vi.mock('firebase/auth', async () => {
  const actual = await vi.importActual<typeof import('firebase/auth')>('firebase/auth');
  return {
    ...actual,
    getAuth: vi.fn(() => mockAuth as Auth),
    onAuthStateChanged: vi.fn((_auth: Auth, callback: (user: User | null) => void) => {
      callback(mockAuth.currentUser || null);
      return mockUnsubscribeAuth;
    }),
    signInWithPopup: vi.fn(() => Promise.resolve({ user: mockUser })),
    signOut: vi.fn(() => Promise.resolve()),
    GoogleAuthProvider: vi.fn(() => ({
      addScope: vi.fn(),
      setCustomParameters: vi.fn(),
    })),
  };
});

// ─── Firestore Mocks ─────────────────────────────────────────

export const mockDocData = new Map<string, any>();
export const mockCollectionData = new Map<string, any[]>();
export const mockUnsubscribes = new Map<string, Unsubscribe>();

export function createMockDocSnap(data: any, exists = true): DocumentSnapshot {
  return {
    exists: () => exists,
    data: () => data,
    id: data?.id || 'mock-doc-id',
    ref: {} as DocumentReference,
    metadata: {} as any,
    get: vi.fn((field: string) => data?.[field]),
  } as DocumentSnapshot;
}

export function createMockQuerySnap(docs: any[]): QuerySnapshot {
  const docSnaps = docs.map((d, i) => createMockDocSnap({ ...d, id: d.id || `doc-${i}` }));
  return {
    docs: docSnaps as QueryDocumentSnapshot[],
    empty: docs.length === 0,
    size: docs.length,
    forEach: vi.fn((callback: any) => docSnaps.forEach(callback)),
    query: {} as Query,
    metadata: {} as any,
    docChanges: vi.fn(() => []),
  } as QuerySnapshot;
}

vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    getFirestore: vi.fn(() => ({} as Firestore)),
    collection: vi.fn((_db: Firestore, path: string) => ({ id: path } as CollectionReference)),
    doc: vi.fn((_db: Firestore, ...pathSegments: string[]) => ({
      id: pathSegments.join('/'),
      path: pathSegments.join('/'),
    } as DocumentReference)),
    query: vi.fn((_ref: CollectionReference, ..._constraints: any[]) => ({
      _ref,
      _constraints,
    } as Query)),
    orderBy: vi.fn((field: string, dir = 'asc') => ({ field, dir })),
    where: vi.fn((field: string, op: string, value: any) => ({ field, op, value })),
    limit: vi.fn((n: number) => ({ n })),
    onSnapshot: vi.fn((ref: any, callback: any) => {
      const key = typeof ref === 'string' ? ref : ref.id || 'default';
      const docs = mockCollectionData.get(key) || [];
      callback(createMockQuerySnap(docs));
      const unsub = vi.fn();
      mockUnsubscribes.set(key, unsub);
      return unsub;
    }),
    getDoc: vi.fn((ref: DocumentReference) => {
      const data = mockDocData.get(ref.path);
      return Promise.resolve(createMockDocSnap(data, !!data));
    }),
    getDocs: vi.fn((q: Query) => {
      const key = (q as any)._ref?.id || 'default';
      const docs = mockCollectionData.get(key) || [];
      return Promise.resolve(createMockQuerySnap(docs));
    }),
    addDoc: vi.fn((_ref: CollectionReference, data: any) => {
      const id = `mock-doc-${Date.now()}`;
      const existing = mockCollectionData.get(_ref.id) || [];
      mockCollectionData.set(_ref.id, [...existing, { ...data, id }]);
      return Promise.resolve({ id } as DocumentReference);
    }),
    setDoc: vi.fn((_ref: DocumentReference, data: any, _options?: any) => {
      mockDocData.set(_ref.path, { ...mockDocData.get(_ref.path), ...data });
      return Promise.resolve();
    }),
    updateDoc: vi.fn((_ref: DocumentReference, data: any) => {
      mockDocData.set(_ref.path, { ...mockDocData.get(_ref.path), ...data });
      return Promise.resolve();
    }),
    deleteDoc: vi.fn(() => Promise.resolve()),
    serverTimestamp: vi.fn(() => ({ _seconds: Date.now() / 1000, _nanoseconds: 0 })),
    Timestamp: {
      fromDate: vi.fn((date: Date) => ({ toDate: () => date, toMillis: () => date.getTime() })),
      now: vi.fn(() => ({ toDate: () => new Date(), toMillis: () => Date.now() })),
    },
    writeBatch: vi.fn(() => ({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(() => Promise.resolve()),
    })),
    runTransaction: vi.fn((db: Firestore, fn: any) => fn({
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    })),
    initializeFirestore: vi.fn(() => ({})),
    getDocFromServer: vi.fn(() => Promise.resolve(createMockDocSnap(null, false))),
  };
});

// ─── Firebase App Mock ───────────────────────────────────────

vi.mock('firebase/app', async () => {
  const actual = await vi.importActual<typeof import('firebase/app')>('firebase/app');
  return {
    ...actual,
    initializeApp: vi.fn(() => ({ name: '[DEFAULT]', options: {} })),
    getApp: vi.fn(() => ({ name: '[DEFAULT]', options: {} })),
    getApps: vi.fn(() => []),
  };
});

// Helper to reset all mock state between tests
export function resetFirestoreMocks() {
  mockDocData.clear();
  mockCollectionData.clear();
  mockUnsubscribes.clear();
  mockAuth.currentUser = null;
}
