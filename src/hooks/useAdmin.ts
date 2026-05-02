import { useState, useEffect, useCallback } from 'react';
import { pb, sortByDateDesc, withAuthRefresh } from '../lib/pb';
import { logError } from '../lib/logger';
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
          pb.collection('users').getFullList(),
          pb.collection('logs').getFullList({ expand: 'user' }),
          pb.collection('reports').getFullList({ expand: 'reporter' }),
        ]));

        if (!cancelled) {
          setAllUsers(sortByDateDesc(usersList, 'last_seen') as unknown as UserProfile[]);
          setLogs(sortByDateDesc(logsList).map(l => ({
            ...l,
            userName: (l as any).expand?.user?.name || '',
          })) as unknown as ActionLog[]);
          setReports(sortByDateDesc(reportsList).map(r => ({
            ...r,
            reporterName: (r as any).expand?.reporter?.name || '',
          })) as unknown as Report[]);
        }

        // Realtime subscriptions
        await pb.collection('users').subscribe('*', () => {
          if (cancelled) return;
          pb.collection('users').getFullList()
            .then(u => { if (!cancelled) setAllUsers(sortByDateDesc(u, 'last_seen') as unknown as UserProfile[]); })
            .catch(() => {});
        });

        await pb.collection('logs').subscribe('*', () => {
          if (cancelled) return;
          pb.collection('logs').getFullList({ expand: 'user' })
            .then(l => { if (!cancelled) setLogs(sortByDateDesc(l).map(item => ({ ...item, userName: (item as any).expand?.user?.name || '' })) as unknown as ActionLog[]); })
            .catch(() => {});
        });

        await pb.collection('reports').subscribe('*', () => {
          if (cancelled) return;
          pb.collection('reports').getFullList({ expand: 'reporter' })
            .then(r => { if (!cancelled) setReports(sortByDateDesc(r).map(item => ({ ...item, reporterName: (item as any).expand?.reporter?.name || '' })) as unknown as Report[]); })
            .catch(() => {});
        });
      } catch (err) {
        logError('admin.load', 'No se pudo cargar el panel admin', err);
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
      logError('admin.log-create', 'No se pudo crear log de auditoría', e, { action });
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
      logError('reports.create', 'No se pudo crear denuncia', e, {
        type: reportModal.type,
        targetId: reportModal.targetId,
      });
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
