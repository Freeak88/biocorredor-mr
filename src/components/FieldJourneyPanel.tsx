import { useEffect, useMemo, useState } from 'react';
import { Check, CloudOff, Compass, Flag, Map, Play, RefreshCw, X } from 'lucide-react';
import { pb } from '../lib/pb';
import { getPendingCount, isOnline, onOnlineChange } from '../lib/offline';
import type { AuthUser } from '../hooks/useAuth';

const PILOT_EVENT_ID = '2hp2demnto50j73';
const PILOT_SITE = 'Sector Centro';
const CHECKLIST = [
  'Hora del teléfono sincronizada',
  'Mapa y sectores disponibles sin conexión',
  'Cinco observaciones de prueba verificadas',
  'Participantes y dispositivos registrados',
  'Punto de encuentro confirmado',
];

type JourneyState = { status: 'ready' | 'active' | 'closed'; startedAt?: string; endedAt?: string };

interface Props {
  user: AuthUser;
  onClose: () => void;
  onOpenSurvey: () => void;
  onOpenMap: () => void;
}

export default function FieldJourneyPanel({ user, onClose, onOpenSurvey, onOpenMap }: Props) {
  const [online, setOnline] = useState(isOnline());
  const [pending, setPending] = useState(0);
  const [journey, setJourney] = useState<JourneyState>(() => {
    try { return JSON.parse(localStorage.getItem(`biocorredor_journey_${user.uid}`) || '{"status":"ready"}'); } catch { return { status: 'ready' }; }
  });
  const [checked, setChecked] = useState<boolean[]>(() => {
    try { return JSON.parse(localStorage.getItem(`biocorredor_checklist_${user.uid}`) || '[]'); } catch { return []; }
  });
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubscribe = onOnlineChange(setOnline);
    const refresh = () => void getPendingCount().then(setPending);
    refresh();
    const interval = window.setInterval(refresh, 4000);
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, []);

  const completedChecklist = useMemo(() => checked.filter(Boolean).length, [checked]);
  const canStart = completedChecklist === CHECKLIST.length;

  const persistJourney = (next: JourneyState) => {
    setJourney(next);
    localStorage.setItem(`biocorredor_journey_${user.uid}`, JSON.stringify(next));
  };

  const toggleChecklist = (index: number) => {
    const next = [...checked]; next[index] = !next[index]; setChecked(next);
    localStorage.setItem(`biocorredor_checklist_${user.uid}`, JSON.stringify(next));
  };

  const startJourney = async () => {
    if (!canStart) { setMessage('Completá la lista de salida antes de iniciar.'); return; }
    const startedAt = new Date().toISOString();
    try { await pb.collection('survey_events').update(PILOT_EVENT_ID, { status: 'active', started_at: startedAt, time_sync_status: 'confirmed' }); } catch { setMessage('Inicio guardado localmente. Se confirmará al sincronizar.'); }
    persistJourney({ status: 'active', startedAt });
  };

  const closeJourney = async () => {
    const endedAt = new Date().toISOString();
    try { await pb.collection('survey_events').update(PILOT_EVENT_ID, { status: 'completed', ended_at: endedAt, closed_at: endedAt, closed_by: user.uid }); } catch { setMessage('Cierre guardado localmente. Falta confirmación del servidor.'); }
    persistJourney({ ...journey, status: 'closed', endedAt });
  };

  return <div className="fixed inset-0 z-[2500] overflow-y-auto bg-atlas-paper text-atlas-ink">
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-10 sm:px-8">
      <header className="sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between border-b border-atlas-ink bg-atlas-paper/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-55">BIOCORREDOR MR</p><h2 className="font-serif text-2xl italic">Jornada de campo</h2></div>
        <button aria-label="Cerrar jornada" onClick={onClose} className="p-2 hover:bg-atlas-stone"><X /></button>
      </header>

      <div className={`mb-4 flex items-center justify-between border px-3 py-3 font-sans text-xs ${online ? 'border-atlas-ink/20' : 'border-amber-700 bg-amber-50 text-amber-900'}`}>
        <span className="inline-flex items-center gap-2">{online ? <RefreshCw className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />}{online ? 'Con conexión' : 'Sin conexión'}</span>
        <span className="font-mono">{pending} pendientes</span>
      </div>

      <section className="border-b border-atlas-ink/20 pb-5">
        <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-wider opacity-55">Evento piloto</p><h3 className="mt-1 font-serif text-xl italic">Jornada Biocorredor MR</h3><p className="mt-1 font-sans text-xs opacity-65">{PILOT_SITE} · Equipo asignado por coordinación</p></div><span className={`border px-2 py-1 font-mono text-[10px] uppercase ${journey.status === 'active' ? 'border-green-700 text-green-800' : journey.status === 'closed' ? 'border-atlas-ink/30 opacity-55' : 'border-atlas-earth text-atlas-earth'}`}>{journey.status === 'active' ? 'En curso' : journey.status === 'closed' ? 'Cerrada' : 'Lista para iniciar'}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="font-mono text-[9px] uppercase opacity-45">Sector</p><p className="mt-1 font-sans text-sm">SEC-CENTRO</p></div><div><p className="font-mono text-[9px] uppercase opacity-45">Protocolo</p><p className="mt-1 font-sans text-sm">INV-GENERAL v1.0</p></div><div><p className="font-mono text-[9px] uppercase opacity-45">Equipo</p><p className="mt-1 font-sans text-sm">Asignado</p></div><div><p className="font-mono text-[9px] uppercase opacity-45">Inicio</p><p className="mt-1 font-sans text-sm">{journey.startedAt ? new Date(journey.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'Pendiente'}</p></div></div>
      </section>

      {journey.status === 'ready' && <section className="py-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-sans text-xs font-bold uppercase tracking-wider">Antes de salir</h3><span className="font-mono text-[10px] opacity-55">{completedChecklist}/{CHECKLIST.length}</span></div><div className="space-y-2">{CHECKLIST.map((item, index) => <button key={item} onClick={() => toggleChecklist(index)} className="flex w-full items-center gap-3 border-b border-atlas-ink/10 py-3 text-left font-sans text-sm"><span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${checked[index] ? 'border-atlas-ink bg-atlas-ink text-atlas-paper' : 'border-atlas-ink/35'}`}>{checked[index] && <Check className="h-3 w-3" />}</span>{item}</button>)}</div></section>}

      {journey.status === 'active' && <section className="py-6"><div className="mb-4 flex items-center gap-3"><Compass className="h-6 w-6 text-atlas-earth" /><div><h3 className="font-serif text-xl italic">Recorrido en curso</h3><p className="font-sans text-xs opacity-60">Registrá cada observación apenas la confirmes.</p></div></div><button onClick={onOpenSurvey} className="flex w-full items-center justify-center gap-2 bg-atlas-ink px-4 py-5 font-sans text-xs font-black uppercase tracking-[0.18em] text-atlas-paper hover:bg-atlas-earth"><Play className="h-4 w-4" /> Nueva observación</button></section>}

      {journey.status === 'closed' && <section className="border-l-4 border-atlas-earth px-4 py-5"><h3 className="font-serif text-xl italic">Jornada cerrada</h3><p className="mt-1 font-sans text-sm opacity-70">Esperando sincronización y revisión de coordinación.</p></section>}

      <div className="grid gap-3 sm:grid-cols-2"><button onClick={onOpenMap} className="atlas-button inline-flex items-center justify-center gap-2"><Map className="h-4 w-4" /> Ver mapa y sectores</button>{journey.status === 'ready' && <button onClick={() => void startJourney()} className="inline-flex items-center justify-center gap-2 bg-atlas-earth px-4 py-3 font-sans text-xs font-black uppercase tracking-[0.18em] text-atlas-paper disabled:opacity-50" disabled={!canStart}><Flag className="h-4 w-4" /> Iniciar jornada</button>}{journey.status === 'active' && <button onClick={() => void closeJourney()} className="inline-flex items-center justify-center gap-2 border border-atlas-ink px-4 py-3 font-sans text-xs font-black uppercase tracking-[0.18em] hover:bg-atlas-ink hover:text-atlas-paper"><Flag className="h-4 w-4" /> Cerrar jornada</button>}</div>
      {message && <p className="mt-4 border-l-4 border-atlas-earth px-3 py-2 font-sans text-sm">{message}</p>}
    </div>
  </div>;
}
