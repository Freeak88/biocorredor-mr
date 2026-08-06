import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, CloudOff, LoaderCircle, MapPin, RefreshCw, ShieldAlert, Upload, X } from 'lucide-react';
import { pb } from '../lib/pb';
import { clearQueue, drainQueue, enqueueOp, isOnline, onOnlineChange, type QueuedOp } from '../lib/offline';
import type { AuthUser } from '../hooks/useAuth';
import { matchParcel } from '../services/territorialService';

type Site = { id: string; code: string; name: string };
type Event = { id: string; event_id: string; title: string; site: string };
type Draft = {
  event: string; site: string; scientific_name: string; quantity: string; substrate: string;
  microhabitat: string; notes: string; sensitive_record: 'false' | 'true'; photo?: string;
};

const emptyDraft: Draft = {
  event: '', site: '', scientific_name: '', quantity: '1', substrate: '', microhabitat: '',
  notes: '', sensitive_record: 'false',
};

// IDs from the seeded local pilot volume. The API values take precedence; this keeps
// the field form usable while a local PocketBase volume is warming up or offline.
const localPilotSite: Site = { id: '3mqk3020jn63qcx', code: 'SEC-CENTRO', name: 'Sector Centro' };
const localPilotEvent: Event = { id: '2hp2demnto50j73', event_id: 'BIO-MR-PILOTO-2026-08-11', title: 'Jornada piloto Biocorredor MR', site: localPilotSite.id };

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function sha256(dataUrl: string): Promise<string> {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (char) => char.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface Props { user: AuthUser; onClose: () => void; }

export default function FieldSurveyPanel({ user, onClose }: Props) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [sites, setSites] = useState<Site[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [online, setOnline] = useState(isOnline());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectedEvent = useMemo(() => events.find((item) => item.id === draft.event), [draft.event, events]);

  useEffect(() => {
    const unsubscribe = onOnlineChange(setOnline);
    void Promise.all([
      pb.collection('sites').getList<Site>(1, 50, { sort: 'code', filter: 'status = "active"' }),
      pb.collection('survey_events').getList<Event>(1, 50, { sort: '-created', filter: 'status = "active"' }),
    ]).then(([sitePage, eventPage]) => {
      const siteRecords = sitePage.items;
      const eventRecords = eventPage.items;
      setSites(siteRecords);
      setEvents(eventRecords);
      if (eventRecords[0]) setDraft((current) => ({ ...current, event: eventRecords[0].id, site: eventRecords[0].site || siteRecords[0]?.id || '' }));
    }).catch(() => {
      setSites([localPilotSite]);
      setEvents([localPilotEvent]);
      setDraft((current) => ({ ...current, event: localPilotEvent.id, site: localPilotSite.id }));
      setMessage('Usando configuración piloto local. El registro puede quedar local.');
    });
    return unsubscribe;
  }, []);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setMessage('Este teléfono no ofrece geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setPosition([coords.latitude, coords.longitude]); setMessage('Ubicación capturada.'); },
      () => setMessage('No se pudo capturar la ubicación. El registro seguirá sin GPS.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.event || !draft.site || !draft.notes.trim()) {
      setMessage('Completá evento, sector y observación objetiva.');
      return;
    }
    setSaving(true);
    try {
      const photoData = photo ? await fileToDataUrl(photo) : undefined;
      const mediaHash = photoData ? await sha256(photoData) : undefined;
      const territorialContext = position
        ? await matchParcel(position[0], position[1])
        : { status: 'indeterminate' as const, source: 'local' as const, checked_at: new Date().toISOString(), reason: 'La observación no tiene coordenadas GPS.' };
      const payload = {
        occurrence: {
          occurrence_id: makeId('BIO-MR'), event: draft.event, observer: user.uid,
          observed_at: new Date().toISOString(), latitude: position?.[0] ?? null,
          longitude: position?.[1] ?? null, coordinate_uncertainty_m: position ? 10 : null,
          location_source: position ? 'gps' : 'none', field_name: 'Biocorredor MR',
          scientific_name: draft.scientific_name.trim() || 'Morfoespecie pendiente', taxon_group: 'fungi',
          quantity: Number(draft.quantity) || 1, quantity_unit: 'ejemplares', substrate: draft.substrate,
          microhabitat: draft.microhabitat, occurrence_status: 'detected', identification_status: 'unidentified',
          sensitive_record: draft.sensitive_record, public_visibility: draft.sensitive_record === 'true' ? 'private' : 'team',
          notes: draft.notes.trim(), local_status: online ? 'syncing' : 'local_only',
          territorial_context_json: territorialContext,
          territorial_context_status: territorialContext.status,
        },
        media: photoData ? { dataUrl: photoData, sha256: mediaHash, mimeType: photo?.type, fileSize: photo?.size } : undefined,
      };
      await enqueueOp('field-occurrence', payload);
      setMessage(online ? 'Registro guardado en la cola de sincronización.' : 'Registro guardado en este teléfono. Se sincronizará al volver la conexión.');
      setDraft({ ...emptyDraft, event: draft.event, site: draft.site });
      setPhoto(null); setPhotoPreview('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el registro.');
    } finally { setSaving(false); }
  };

  const syncPending = async (ops: QueuedOp[]) => {
    for (const op of ops) {
      if (op.type === 'route-point') {
        const payload = op.payload as { routePoint: Record<string, unknown> };
        await pb.collection('route_points').create(payload.routePoint);
        continue;
      }
      if (op.type !== 'field-occurrence') continue;
      const payload = op.payload as { occurrence: Record<string, unknown>; media?: { dataUrl: string; sha256: string; mimeType: string; fileSize: number } };
      const occurrence = await pb.collection('occurrences').create(payload.occurrence);
      if (payload.media) {
        const blob = await (await fetch(payload.media.dataUrl)).blob();
        const formData = new FormData();
        formData.append('occurrence', occurrence.id);
        formData.append('original_file', new File([blob], `${payload.media.sha256}.jpg`, { type: payload.media.mimeType }));
        formData.append('sha256', payload.media.sha256);
        formData.append('mime_type', payload.media.mimeType);
        formData.append('file_size', String(payload.media.fileSize));
        formData.append('media_type', 'photo'); formData.append('is_original', 'true');
        formData.append('sync_status', 'synced'); formData.append('created_by', user.uid);
        await pb.collection('media_evidence').create(formData);
      }
    }
  };

  useEffect(() => {
    if (!online) return;
    const sync = async () => {
      const ops = await drainQueue();
      if (!ops.length) return;
      try { await syncPending(ops); await clearQueue(); setMessage(`${ops.length} registro(s) sincronizado(s).`); }
      catch { setMessage('La sincronización falló. El registro queda pendiente para reintentar.'); }
    };
    void sync();
  }, [online]);

  return <div className="fixed inset-0 z-[3000] overflow-y-auto bg-atlas-paper text-atlas-ink">
    <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-10 sm:px-8">
      <header className="sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between border-b border-atlas-ink bg-atlas-paper/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <div><p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-55">BIOCORREDOR MR</p><h2 className="font-serif text-2xl italic">Nuevo relevamiento</h2></div>
        <button aria-label="Cerrar relevamiento" onClick={onClose} className="p-2 hover:bg-atlas-stone"><X /></button>
      </header>
      <div className={`mb-4 flex items-center gap-2 border px-3 py-2 font-sans text-xs ${online ? 'border-atlas-ink/20' : 'border-amber-700 bg-amber-50 text-amber-900'}`}>
        {online ? <RefreshCw className="h-4 w-4" /> : <CloudOff className="h-4 w-4" />} {online ? 'Con conexión: se guardará y sincronizará.' : 'Sin conexión: se guardará en este teléfono.'}
      </div>
      <form onSubmit={submit} className="space-y-5">
        <label className="block font-sans text-xs font-bold uppercase tracking-wider">Evento<select value={draft.event} onChange={(e) => update('event', e.target.value)} className="atlas-input mt-2 w-full" required><option value="">Seleccionar evento</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title || item.event_id}</option>)}</select></label>
        <label className="block font-sans text-xs font-bold uppercase tracking-wider">Sector<select value={draft.site} onChange={(e) => update('site', e.target.value)} className="atlas-input mt-2 w-full" required><option value="">Seleccionar sector</option>{sites.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-4"><label className="block font-sans text-xs font-bold uppercase tracking-wider">Morfoespecie<input value={draft.scientific_name} onChange={(e) => update('scientific_name', e.target.value)} placeholder="Pendiente si no se conoce" className="atlas-input mt-2 w-full" /></label><label className="block font-sans text-xs font-bold uppercase tracking-wider">Cantidad<input type="number" min="1" value={draft.quantity} onChange={(e) => update('quantity', e.target.value)} className="atlas-input mt-2 w-full" /></label></div>
        <div className="grid grid-cols-2 gap-4"><label className="block font-sans text-xs font-bold uppercase tracking-wider">Sustrato<input value={draft.substrate} onChange={(e) => update('substrate', e.target.value)} placeholder="Suelo, tronco..." className="atlas-input mt-2 w-full" /></label><label className="block font-sans text-xs font-bold uppercase tracking-wider">Microhábitat<input value={draft.microhabitat} onChange={(e) => update('microhabitat', e.target.value)} placeholder="Sombra, humedad..." className="atlas-input mt-2 w-full" /></label></div>
        <label className="block font-sans text-xs font-bold uppercase tracking-wider">Observación objetiva<textarea value={draft.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Qué viste, dónde estaba y qué condiciones había" className="mt-2 min-h-28 w-full border border-atlas-ink bg-transparent p-3 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-atlas-earth" required /></label>
        <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={locate} className="atlas-button inline-flex items-center justify-center gap-2"><MapPin className="h-4 w-4" />{position ? `${position[0].toFixed(4)}, ${position[1].toFixed(4)}` : 'Capturar ubicación'}</button><label className="atlas-button inline-flex cursor-pointer items-center justify-center gap-2"><Camera className="h-4 w-4" />{photo ? 'Cambiar foto' : 'Agregar foto original'}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setPhoto(file); setPhotoPreview(await fileToDataUrl(file)); } }} /></label></div>
        {photoPreview && <img src={photoPreview} alt="Vista previa de la evidencia" className="max-h-56 w-full object-cover" />}
        <label className="flex items-start gap-3 border border-atlas-ink/20 p-3 font-sans text-xs"><input type="checkbox" checked={draft.sensitive_record === 'true'} onChange={(e) => update('sensitive_record', e.target.checked ? 'true' : 'false')} className="mt-0.5" /><span><span className="flex items-center gap-1 font-bold"><ShieldAlert className="h-4 w-4" /> Registro sensible</span><span className="mt-1 block opacity-70">Oculta la ubicación precisa y limita la visibilidad al equipo.</span></span></label>
        {message && <p className="border-l-4 border-atlas-earth px-3 py-2 font-sans text-sm">{message}</p>}
        <button disabled={saving || !selectedEvent} className="flex w-full items-center justify-center gap-2 bg-atlas-ink px-4 py-4 font-sans text-xs font-black uppercase tracking-[0.18em] text-atlas-paper hover:bg-atlas-earth disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4" /> Guardar relevamiento</>}</button>
        <p className="text-center font-mono text-[10px] uppercase tracking-wider opacity-45"><Check className="mr-1 inline h-3 w-3" /> La evidencia original queda asociada al registro</p>
      </form>
    </div>
  </div>;
}
