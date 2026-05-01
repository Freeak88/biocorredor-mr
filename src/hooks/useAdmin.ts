import { useState, useEffect, useCallback } from 'react';
import { pb, withAuthRefresh } from '../lib/pb';
import type { ActionLog, Report, UserProfile, AuthUser } from '../types';

export function useAdmin(user: AuthUser | null, isAdmin: boolean, currentUserProfile: UserProfile | null) {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<'logs' | 'reports'>('logs');

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    (async () => {
      try {
        // Initial loads
        setAdminError(null);
        const [usersList, logsList, reportsList] = await withAuthRefresh(() => Promise.all([
          pb.collection('users').getFullList({ sort: '-last_seen' }),
          pb.collection('logs').getFullList({ sort: '-created', expand: 'user' }),
          pb.collection('reports').getFullList({ sort: '-created', expand: 'reporter' }),
        ]));

        if (!cancelled) {
          setAllUsers(usersList as unknown as UserProfile[]);
          setLogs(logsList.map(l => ({
            ...l,
            userName: (l as any).expand?.user?.name || '',
          })) as unknown as ActionLog[]);
          setReports(reportsList.map(r => ({
            ...r,
            reporterName: (r as any).expand?.reporter?.name || '',
          })) as unknown as Report[]);
        }

        // Realtime subscriptions
        await pb.collection('users').subscribe('*', () => {
          if (cancelled) return;
          pb.collection('users').getFullList({ sort: '-last_seen' })
            .then(u => { if (!cancelled) setAllUsers(u as unknown as UserProfile[]); })
            .catch(() => {});
        });

        await pb.collection('logs').subscribe('*', () => {
          if (cancelled) return;
          pb.collection('logs').getFullList({ sort: '-created', expand: 'user' })
            .then(l => { if (!cancelled) setLogs(l.map(item => ({ ...item, userName: (item as any).expand?.user?.name || '' })) as unknown as ActionLog[]); })
            .catch(() => {});
        });

        await pb.collection('reports').subscribe('*', () => {
          if (cancelled) return;
          pb.collection('reports').getFullList({ sort: '-created', expand: 'reporter' })
            .then(r => { if (!cancelled) setReports(r.map(item => ({ ...item, reporterName: (item as any).expand?.reporter?.name || '' })) as unknown as Report[]); })
            .catch(() => {});
        });
      } catch (err) {
        console.error("Admin load error", err);
        if (!cancelled) setAdminError(err instanceof Error ? err.message : 'No se pudo cargar el panel admin.');
      }
    })();

    return () => {
      cancelled = true;
      pb.collection('users').unsubscribe('*').catch(() => {});
      pb.collection('logs').unsubscribe('*').catch(() => {});
      pb.collection('reports').unsubscribe('*').catch(() => {});
    };
  }, [isAdmin]);

  const createLog = useCallback(async (action: string, details: string) => {
    if (!user) return;
    try {
      await withAuthRefresh(() => pb.collection('logs').create({
        user: user.uid,
        action,
        details,
      }));
    } catch (e) {
      console.error("Log error", e);
    }
  }, [user]);

  const submitReport = useCallback(async (reason: string, reportModal: { type: 'message' | 'user' | 'sighting' | 'comment'; targetId: string; content?: string } | null) => {
    if (!user || !reportModal) return;
    try {
      await withAuthRefresh(() => pb.collection('reports').create({
        reporter: user.uid,
        type: reportModal.type,
        target_id: reportModal.targetId,
        content: reportModal.content || '',
        reason,
        status: 'pending',
      }));
      await createLog('report_submitted', `Denunció ${reportModal.type} (${reportModal.targetId}) por ${reason}`);
    } catch (e) {
      console.error("Report error", e);
    }
  }, [user, createLog]);

  const exportToGeoJSON = useCallback((sightings: any[]) => {
    const geojson = {
      type: 'FeatureCollection',
      features: sightings.map(s => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [s.lng, s.lat]
        },
        properties: {
          id: s.id,
          name: s.mushroom_name || s.mushroomName,
          description: s.description,
          userName: s.userName || s.expand?.user?.name,
          status: s.status,
          date: s.created || null,
        }
      }))
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fungimap_qgis_export_${new Date().toISOString().split('T')[0]}.geojson`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    createLog('export_data', `Exportó ${sightings.length} puntos a GeoJSON`);
  }, [createLog]);

  return {
    logs,
    allUsers,
    reports,
    adminError,
    showAdminPanel,
    setShowAdminPanel,
    activeAdminTab,
    setActiveAdminTab,
    createLog,
    submitReport,
    exportToGeoJSON,
  };
}
