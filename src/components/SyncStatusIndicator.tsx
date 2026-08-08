import React from 'react';
import { Check, CloudOff, LoaderCircle, TriangleAlert } from 'lucide-react';
import { syncStatusLabel } from '../hooks/useSyncStatus';
import type { CanonicalSyncStatus } from '../lib/remoteSync';

export default function SyncStatusIndicator({ status }: { status: CanonicalSyncStatus }) {
  const Icon = status.state === 'ONLINE_SYNCED' || status.state === 'NEVER_SYNCED' ? Check : status.state === 'OFFLINE' ? CloudOff : status.state === 'ERROR' || status.state === 'BACKEND_UNAVAILABLE' ? TriangleAlert : LoaderCircle;
  const tone = status.state === 'ONLINE_SYNCED' ? 'text-emerald-700' : status.state === 'ERROR' || status.state === 'BACKEND_UNAVAILABLE' ? 'text-red-700' : 'text-atlas-earth';
  return <div className={`flex items-center gap-1.5 text-[9px] font-sans font-black uppercase tracking-wider ${tone}`} aria-live="polite" title="Estado de tus registros">
    <Icon className={`h-3.5 w-3.5 ${status.state === 'ONLINE_PENDING' ? 'animate-pulse' : ''}`} />
    <span className="hidden sm:inline">{syncStatusLabel(status)}</span>
  </div>;
}
