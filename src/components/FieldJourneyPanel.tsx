import { useEffect, useMemo, useState } from 'react';
import { Check, CloudOff, Compass, Flag, Map, Play, RefreshCw, X } from 'lucide-react';
import type { AuthUser } from '../hooks/useAuth';
import { loadCurrentAssignment, type FieldAssignment } from '../services/fieldAssignment';
import { createSyncIdentity, enqueueSyncDataset, getDeviceId, getLocalSyncEntity, makeSyncKey } from '../lib/remoteSync';
import { useSyncStatus, syncStatusLabel } from '../hooks/useSyncStatus';

const CHECKLIST = [
  'Hora del teléfono sincronizada',
  'Mapa y sectores disponibles sin conexión',
  'Cinco observaciones de prueba verificadas',
  'Participantes y dispositivos registrados',
  'Punto de encuentro confirmado',
];

type JourneyState = { status: 'ready' | 'active' | 'closed'; startedAt?: string; endedAt?: string };
type CloseDraft = { weather: string; habitat: string; distance_m: string; incidents: string; unvisited_sectors: string };

interface Props {
  user: AuthUser;
  onClose: () => void;
  onOpenSurvey: () => void;
  onOpenMap: () => void;
}

export default function FieldJourneyPanel({ user, onClose, onOpenSurvey, onOpenMap }: Props) {
  const { status: syncStatus } = useSyncStatus(true);
  const [journey, setJourney] = useState<JourneyState>(() => {
    try { return JSON.parse(localStorage.getItem(`biocorredor_journey_${user.uid}`) || '{"status":"ready"}'); } catch { return { status: 'ready' }; }
  });
  const [checked, setChecked] = useState<boolean[]>(() => {
    try { return JSON.parse(localStorage.getItem(`biocorredor_checklist_${user.uid}`) || '[]'); } catch { return []; }
  });
  const [message, setMessage] = useState('');
  const [assignment, setAssignment] = useState<FieldAssignment | null>(null);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeDraft, setCloseDraft] = useState<CloseDraft>({ weather: '', habitat: '', distance_m: '', incidents: '', unvisited_sectors: '' });

  useEffect(() => {
    void loadCurrentAssignment(user.uid).then(async (nextAssignment) => {
      setAssignment(nextAssignment);
      if (!nextAssignment) return;
      const key = makeSyncKey(getDeviceId(), 'survey_event', `journey-${nextAssignment.event}`);
      const localEvent = await getLocalSyncEntity(key);
      const data = localEvent?.data;
      if (data?.status === 'active' || data?.status === 'completed') {
        setJourney({ status: data.status === 'active' ? 'active' : 'closed', startedAt: data.started_at, endedAt: data.ended_at });
      }
    });
  }, [user.uid]);

  const completedChecklist = useMemo(() => checked.filter(Boolean).length, [checked]);
  const canStart = true;

  const persistJourney = (next: JourneyState) => {
    setJourney(next);
    localStorage.setItem(`biocorredor_journey_${user.uid}`, JSON.stringify(next));
    window.dispatchEvent(new Event('biocorredor:journey-changed'));
  };

  const toggleChecklist = (index: number) => {
    const next = [...checked]; next[index] = !next[index]; setChecked(next);
    localStorage.setItem(`biocorredor_checklist_${user.uid}`, JSON.stringify(next));
  };

  const queueJourney = async (status: 'active' | 'completed', values: Record<string, any>) => {
    if (!assignment) return;
    const identity = createSyncIdentity('survey_event', `journey-${assignment.event}`);
    await enqueueSyncDataset({
      event: { ...identity, data: { event_id: assignment.expand?.event?.event_id || assignment.event, title: assignment.expand?.event?.title || 'Jornada de campo', status, ...values }, local_updated_at: new Date().toISOString() },
      occurrences: [], territorial_changes: [], media: [],
    });
  };

  const startJourney = async () => {
    const startedAt = new Date().toISOString();
    if (!assignment) { setMessage('Todavía no tenés una jornada asignada.'); return; }
    try { await queueJourney('active', { started_at: startedAt, time_sync_status: 'confirmed' }); setMessage('Jornada guardada en este dispositivo.'); } catch { setMessage('No se pudo guardar la jornada en este dispositivo.'); return; }
    persistJourney({ status: 'active', startedAt });
  };

  const closeJourney = async () => {
    const endedAt = new Date().toISOString();
    const durationMinutes = journey.startedAt ? Math.round((Date.parse(endedAt) - Date.parse(journey.startedAt)) / 60000) : undefined;
    if (assignment) { try { await queueJourney('completed', { ended_at: endedAt, closed_at: endedAt, closed_by: user.uid, duration_minutes: durationMinutes, distance_m: Number(closeDraft.distance_m) || undefined, weather: closeDraft.weather, habitat: closeDraft.habitat, incidents: closeDraft.incidents, unvisited_sectors: closeDraft.unvisited_sectors, observers_count: 1 }); } catch { setMessage('Cierre guardado localmente. Requiere atención para sincronizar.'); return; } }
    persistJourney({ ...journey, status: 'closed', endedAt });
    setShowCloseForm(false);
  };

  return <div className="fixed inset-0 z-[2500] overflow-y-auto bg-atlas-paper text-atlas-ink">
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-10 sm:px-8">
      <header className="sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between border-b border-atlas-ink bg-atlas-paper/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-55">BIOCORREDOR MR</p><h2 className="font-serif text-2xl italic">Jornada de campo</h2></div>
        <button aria-label="Cerrar jornada" onClick={onClose} className="p-2 hover:bg-atlas-stone"><X /></button>
      </header>

      <div className={`mb-4 flex items-center justify-between border px-3 py-3 font-sans text-xs ${syncStatus.state === 'OFFLINE' ? 'border-amber-700 bg-amber-50 text-amber-900' : 'border-atlas-ink/20'}`}>
        <span className="inline-flex items-center gap-2">{syncStatus.state === 'OFFLINE' ? <CloudOff className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}{syncStatusLabel(syncStatus)}</span>
        <span className="font-mono">{syncStatus.pending_count} pendientes</span>
      </div>

      <section className="border-b border-atlas-ink/20 pb-5">
        <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-wider opacity-55">Jornada asignada</p><h3 className="mt-1 font-serif text-xl italic">{assignment?.expand?.event?.title || 'Sin jornada asignada'}</h3><p className="mt-1 font-sans text-xs opacity-65">{assignment?.expand?.site?.code || 'Sin sector'} · {assignment?.expand?.team?.code || 'Sin equipo'}</p></div><span className={`border px-2 py-1 font-mono text-[10px] uppercase ${journey.status === 'active' ? 'border-green-700 text-green-800' : journey.status === 'closed' ? 'border-atlas-ink/30 opacity-55' : 'border-atlas-earth text-atlas-earth'}`}>{journey.status === 'active' ? 'En curso' : journey.status === 'closed' ? 'Cerrada' : assignment ? 'Asignada' : 'Pendiente'}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="font-mono text-[9px] uppercase opacity-45">Sector</p><p className="mt-1 font-sans text-sm">{assignment?.expand?.site?.code || 'Pendiente'}</p></div><div><p className="font-mono text-[9px] uppercase opacity-45">Protocolo</p><p className="mt-1 font-sans text-sm">Asignado</p></div><div><p className="font-mono text-[9px] uppercase opacity-45">Equipo</p><p className="mt-1 font-sans text-sm">{assignment?.expand?.team?.code || 'Pendiente'}</p></div><div><p className="font-mono text-[9px] uppercase opacity-45">Inicio</p><p className="mt-1 font-sans text-sm">{journey.startedAt ? new Date(journey.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'Pendiente'}</p></div></div>
      </section>

      {journey.status === 'ready' && <section className="py-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-sans text-xs font-bold uppercase tracking-wider">Antes de salir</h3><span className="font-mono text-[10px] opacity-55">{completedChecklist}/{CHECKLIST.length}</span></div><p className="mb-3 border-l-4 border-atlas-earth px-3 py-2 font-sans text-xs">La coordinación prepara la jornada. Marcá lo que puedas verificar; no te bloquea la salida.</p><div className="space-y-2">{CHECKLIST.map((item, index) => <button key={item} onClick={() => toggleChecklist(index)} className="flex w-full items-center gap-3 border-b border-atlas-ink/10 py-3 text-left font-sans text-sm"><span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${checked[index] ? 'border-atlas-ink bg-atlas-ink text-atlas-paper' : 'border-atlas-ink/35'}`}>{checked[index] && <Check className="h-3 w-3" />}</span>{item}</button>)}</div></section>}

      {journey.status === 'active' && <section className="py-6"><div className="mb-4 flex items-center gap-3"><Compass className="h-6 w-6 text-atlas-earth" /><div><h3 className="font-serif text-xl italic">Recorrido en curso</h3><p className="font-sans text-xs opacity-60">El trayecto GPS sigue activo mientras registrás observaciones.</p><p className="mt-1 font-mono text-[10px] uppercase tracking-wider opacity-55">Registro GPS asociado al asistente</p></div></div><button onClick={onOpenSurvey} className="flex w-full items-center justify-center gap-2 bg-atlas-ink px-4 py-5 font-sans text-xs font-black uppercase tracking-[0.18em] text-atlas-paper hover:bg-atlas-earth"><Play className="h-4 w-4" /> Nueva observación</button></section>}

      {journey.status === 'closed' && <section className="border-l-4 border-atlas-earth px-4 py-5"><h3 className="font-serif text-xl italic">Jornada cerrada</h3><p className="mt-1 font-sans text-sm opacity-70">Esperando sincronización y revisión de coordinación.</p></section>}

      {showCloseForm && <section className="mb-4 border border-atlas-ink bg-atlas-stone/30 p-4"><h3 className="font-serif text-xl italic">Cierre rápido</h3><p className="mt-1 mb-4 font-sans text-xs opacity-65">Completá solo lo que coordinación necesita para cerrar el recorrido.</p><div className="grid gap-3 sm:grid-cols-3"><input aria-label="Clima" placeholder="Clima" value={closeDraft.weather} onChange={(e) => setCloseDraft({ ...closeDraft, weather: e.target.value })} className="atlas-input" /><input aria-label="Ambiente" placeholder="Ambiente" value={closeDraft.habitat} onChange={(e) => setCloseDraft({ ...closeDraft, habitat: e.target.value })} className="atlas-input" /><input aria-label="Distancia recorrida en metros" type="number" min="0" placeholder="Distancia (m)" value={closeDraft.distance_m} onChange={(e) => setCloseDraft({ ...closeDraft, distance_m: e.target.value })} className="atlas-input" /></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><textarea aria-label="Incidentes" placeholder="Incidentes" value={closeDraft.incidents} onChange={(e) => setCloseDraft({ ...closeDraft, incidents: e.target.value })} className="min-h-20 w-full border border-atlas-ink bg-transparent p-3 font-sans text-sm" /><textarea aria-label="Sectores no recorridos" placeholder="Sectores no recorridos" value={closeDraft.unvisited_sectors} onChange={(e) => setCloseDraft({ ...closeDraft, unvisited_sectors: e.target.value })} className="min-h-20 w-full border border-atlas-ink bg-transparent p-3 font-sans text-sm" /></div><div className="mt-3 flex gap-2"><button onClick={() => void closeJourney()} className="bg-atlas-ink px-4 py-3 font-sans text-xs font-black uppercase tracking-wider text-atlas-paper">Confirmar cierre</button><button onClick={() => setShowCloseForm(false)} className="border border-atlas-ink px-4 py-3 font-sans text-xs">Cancelar</button></div></section>}
      <div className="grid gap-3 sm:grid-cols-2"><button onClick={onOpenMap} className="atlas-button inline-flex items-center justify-center gap-2"><Map className="h-4 w-4" /> Ver mapa y sectores</button>{journey.status === 'ready' && <button onClick={() => void startJourney()} className="inline-flex items-center justify-center gap-2 bg-atlas-earth px-4 py-3 font-sans text-xs font-black uppercase tracking-[0.18em] text-atlas-paper disabled:opacity-50" disabled={!canStart || !assignment}><Flag className="h-4 w-4" /> Iniciar jornada</button>}{journey.status === 'active' && <button onClick={() => setShowCloseForm(true)} className="inline-flex items-center justify-center gap-2 border border-atlas-ink px-4 py-3 font-sans text-xs font-black uppercase tracking-[0.18em] hover:bg-atlas-ink hover:text-atlas-paper"><Flag className="h-4 w-4" /> Cerrar jornada</button>}</div>
      {message && <p className="mt-4 border-l-4 border-atlas-earth px-3 py-2 font-sans text-sm">{message}</p>}
    </div>
  </div>;
}
