import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Download, FileJson, RefreshCw, Shield, X } from 'lucide-react';
import { pb } from '../lib/pb';
import type { AuthUser } from '../hooks/useAuth';

type Occurrence = {
  id: string; occurrence_id: string; observer: string; scientific_name: string;
  observed_at: string; latitude?: number; longitude?: number; notes: string;
  identification_status: string; sensitive_record: string; local_status: string;
};
type RoutePoint = { id: string; observer: string; recorded_at: string; latitude: number; longitude: number };
type OptionRecord = { id: string; name?: string; email?: string; code?: string; title?: string; event_id?: string; site?: string; label?: string; device_id?: string };

interface Props { user: AuthUser; onClose: () => void; }

const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function CoordinatorPanel({ user, onClose }: Props) {
  const [records, setRecords] = useState<Occurrence[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [activeEvents, setActiveEvents] = useState<Array<{ id: string; title: string; event_id: string; team_name?: string }>>([]);
  const [users, setUsers] = useState<OptionRecord[]>([]);
  const [teams, setTeams] = useState<OptionRecord[]>([]);
  const [sites, setSites] = useState<OptionRecord[]>([]);
  const [devices, setDevices] = useState<OptionRecord[]>([]);
  const [assignmentForm, setAssignmentForm] = useState({ event: '', user: '', team: '', site: '', device: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [result, routes, events, userPage, teamPage, sitePage, devicePage] = await Promise.all([
        pb.collection('occurrences').getList<Occurrence>(1, 200, { sort: '-observed_at' }),
        pb.collection('route_points').getList<RoutePoint>(1, 1, { sort: '-recorded_at' }),
        pb.collection('survey_events').getList<{ id: string; title: string; event_id: string; team_name?: string }>(1, 50, { filter: 'status = "active" || status = "draft"', sort: '-started_at' }),
        pb.collection('users').getList<OptionRecord>(1, 200, { sort: 'name' }),
        pb.collection('teams').getList<OptionRecord>(1, 50, { filter: 'status = "active"', sort: 'code' }),
        pb.collection('sites').getList<OptionRecord>(1, 50, { filter: 'status = "active"', sort: 'code' }),
        pb.collection('devices').getList<OptionRecord>(1, 200, { filter: 'status = "available"', sort: 'label' }),
      ]);
      setRecords(result.items);
      setRoutePoints(routes.items);
      setActiveEvents(events.items);
      setUsers(userPage.items.filter((item) => item.id !== user.uid && item.email));
      setTeams(teamPage.items);
      setSites(sitePage.items);
      setDevices(devicePage.items);
      setAssignmentForm((current) => ({ event: current.event || events.items[0]?.id || '', user: current.user || userPage.items[0]?.id || '', team: current.team || teamPage.items[0]?.id || '', site: current.site || sitePage.items[0]?.id || '', device: current.device || devicePage.items[0]?.id || '' }));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudieron cargar las ocurrencias.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => status ? records.filter((record) => record.identification_status === status) : records, [records, status]);

  const download = async (format: 'csv' | 'json') => {
    const payload = format === 'csv'
      ? [['occurrence_id', 'scientific_name', 'observed_at', 'latitude', 'longitude', 'identification_status', 'sensitive_record', 'notes'], ...filtered.map((record) => [record.occurrence_id, record.scientific_name, record.observed_at, record.latitude, record.longitude, record.identification_status, record.sensitive_record, record.notes])].map((row) => row.map(escapeCsv).join(',')).join('\n')
      : JSON.stringify({ project: 'BIOCORREDOR-MR', exportedAt: new Date().toISOString(), records: filtered }, null, 2);
    const blob = new Blob([payload], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `biocorredor-ocurrencias-${new Date().toISOString().slice(0, 10)}.${format}`; link.click(); URL.revokeObjectURL(url);
    try {
      await pb.collection('export_manifests').create({ export_id: `EXP-${Date.now()}`, project: 'BIOCORREDOR-MR', format, record_count: filtered.length, created_by: user.uid, status: 'completed', sha256: 'local-export' });
    } catch { /* Exportar localmente sigue siendo válido aunque falle el registro del manifiesto. */ }
    setMessage(`${filtered.length} registro(s) exportado(s) en ${format.toUpperCase()}.`);
  };

  return <div className="fixed inset-0 z-[3000] overflow-y-auto bg-atlas-paper text-atlas-ink">
    <div className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-10 sm:px-8">
      <header className="sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between border-b border-atlas-ink bg-atlas-paper/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-55">BIOCORREDOR MR · CONTROL</p><h2 className="font-serif text-2xl italic">Ocurrencias de campo</h2></div>
        <button aria-label="Cerrar control" onClick={onClose} className="p-2 hover:bg-atlas-stone"><X /></button>
      </header>
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-atlas-ink/15 pb-4">
        <span className="mr-auto font-sans text-xs uppercase tracking-wider opacity-60"><Shield className="mr-1 inline h-4 w-4" /> {records.length} registros</span>
        <select aria-label="Filtrar por estado" value={status} onChange={(e) => setStatus(e.target.value)} className="border border-atlas-ink bg-transparent px-3 py-2 font-sans text-xs"><option value="">Todos los estados</option><option value="unidentified">Sin identificar</option><option value="pending_review">Pendiente de revisión</option><option value="probable">Probable</option><option value="confirmed">Confirmado</option></select>
        <button onClick={() => void load()} className="atlas-button inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Actualizar</button>
        <button onClick={() => void download('csv')} className="atlas-button inline-flex items-center gap-2"><Download className="h-4 w-4" /> CSV</button>
        <button onClick={() => void download('json')} className="atlas-button inline-flex items-center gap-2"><FileJson className="h-4 w-4" /> JSON</button>
      </div>
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="border border-atlas-ink/20 p-4"><p className="font-mono text-[9px] uppercase opacity-50">Jornadas activas</p><p className="mt-1 font-serif text-2xl italic">{activeEvents.length}</p><p className="mt-1 font-sans text-xs opacity-65">{activeEvents[0]?.title || 'Sin jornada iniciada'}</p></div>
        <div className="border border-atlas-ink/20 p-4"><p className="font-mono text-[9px] uppercase opacity-50">Último punto GPS</p><p className="mt-1 font-serif text-2xl italic">{routePoints.length ? 'Recibido' : 'Pendiente'}</p><p className="mt-1 font-sans text-xs opacity-65">{routePoints[0] ? new Date(routePoints[0].recorded_at).toLocaleTimeString('es-AR') : 'Ningún teléfono sincronizó ruta'}</p></div>
        <div className="border border-atlas-ink/20 p-4"><p className="font-mono text-[9px] uppercase opacity-50">Acción sugerida</p><p className="mt-1 font-sans text-sm">{activeEvents.length && !routePoints.length ? 'Verificar GPS de los equipos' : 'Revisar registros pendientes'}</p></div>
      </section>
      <section className="mb-5 border border-atlas-ink/20 p-4">
        <div className="mb-3"><p className="font-mono text-[9px] uppercase opacity-50">Operación</p><h3 className="font-serif text-xl italic">Asignar una jornada</h3></div>
        <div className="grid gap-3 sm:grid-cols-4">
          <select aria-label="Jornada" value={assignmentForm.event} onChange={(e) => setAssignmentForm({ ...assignmentForm, event: e.target.value })} className="atlas-input"><option value="">Jornada</option>{activeEvents.map((item) => <option key={item.id} value={item.id}>{item.title || item.event_id}</option>)}</select>
          <select aria-label="Participante" value={assignmentForm.user} onChange={(e) => setAssignmentForm({ ...assignmentForm, user: e.target.value })} className="atlas-input"><option value="">Participante</option>{users.map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}</select>
          <select aria-label="Equipo" value={assignmentForm.team} onChange={(e) => setAssignmentForm({ ...assignmentForm, team: e.target.value })} className="atlas-input"><option value="">Equipo</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
          <select aria-label="Sector" value={assignmentForm.site} onChange={(e) => setAssignmentForm({ ...assignmentForm, site: e.target.value })} className="atlas-input"><option value="">Sector</option>{sites.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
          <select aria-label="Dispositivo" value={assignmentForm.device} onChange={(e) => setAssignmentForm({ ...assignmentForm, device: e.target.value })} className="atlas-input"><option value="">Teléfono opcional</option>{devices.map((item) => <option key={item.id} value={item.id}>{item.label || item.device_id}</option>)}</select>
        </div>
        <button onClick={async () => { if (!assignmentForm.event || !assignmentForm.user || !assignmentForm.team || !assignmentForm.site) { setMessage('Completá jornada, participante, equipo y sector.'); return; } try { await pb.collection('event_assignments').create({ ...assignmentForm, device: assignmentForm.device || undefined, assigned_by: user.uid, status: 'assigned' }); setMessage('Asignación creada. El participante la verá al ingresar.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo crear la asignación.'); } }} className="mt-3 atlas-button">Crear asignación</button>
      </section>
      {message && <p className="mb-4 border-l-4 border-atlas-earth px-3 py-2 font-sans text-sm">{message}</p>}
      {loading ? <p className="py-12 text-center font-serif italic">Cargando ocurrencias...</p> : filtered.length === 0 ? <p className="py-12 text-center font-serif italic opacity-60">No hay registros para este filtro.</p> : <div className="overflow-x-auto border border-atlas-ink/20"><table className="w-full min-w-[760px] text-left font-sans text-xs"><thead className="bg-atlas-ink text-atlas-paper"><tr><th className="p-3">Registro</th><th className="p-3">Taxón</th><th className="p-3">Fecha</th><th className="p-3">Ubicación</th><th className="p-3">Estado</th><th className="p-3">Visibilidad</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.id} className="border-t border-atlas-ink/10"><td className="p-3 font-mono">{record.occurrence_id}</td><td className="p-3 font-serif italic">{record.scientific_name}</td><td className="p-3">{record.observed_at ? new Date(record.observed_at).toLocaleString('es-AR') : 'Sin fecha'}</td><td className="p-3">{record.latitude != null ? `${record.latitude.toFixed(4)}, ${record.longitude?.toFixed(4)}` : 'Sin GPS'}</td><td className="p-3 uppercase tracking-wider">{record.identification_status}</td><td className="p-3">{record.sensitive_record === 'true' ? <span className="text-amber-800">Sensible</span> : <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Equipo</span>}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}
