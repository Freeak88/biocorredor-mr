import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera, Check, CloudOff, LoaderCircle, MapPin, RefreshCw, ShieldAlert, Upload, X } from 'lucide-react';
import { pb } from '../lib/pb';
import { drainQueue, enqueueOp, isOnline, onOnlineChange, removeQueuedOps, type QueuedOp } from '../lib/offline';
import { newLocalId } from '../lib/localIds';
import type { AuthUser } from '../hooks/useAuth';
import { matchParcel } from '../services/territorialService';
import { hasActiveLocalJourney, loadCurrentAssignment } from '../services/fieldAssignment';

type Site = { id: string; code: string; name: string };
type Event = { id: string; event_id: string; title: string; site: string };
type Draft = {
  event: string; site: string; record_type: 'biodiversity' | 'habitat' | 'impact'; scientific_name: string; quantity: string; substrate: string;
  microhabitat: string; notes: string; sensitive_record: 'false' | 'true'; paper_id: string; taxon_group: string;
  identification_qualifier: string; count_method: string; impact_type: string; photo?: string;
};

const emptyDraft: Draft = {
  event: '', site: '', record_type: 'biodiversity', scientific_name: '', quantity: '1', substrate: '', microhabitat: '',
  notes: '', sensitive_record: 'false', paper_id: '', taxon_group: 'other', identification_qualifier: 'unknown', count_method: 'estimated', impact_type: 'other',
};

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
  const [position, setPosition] = useState<{ coords: [number, number]; accuracy: number; capturedAt: string } | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [online, setOnline] = useState(isOnline());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selectedEvent = useMemo(() => events.find((item) => item.id === draft.event), [draft.event, events]);

  useEffect(() => {
    const unsubscribe = onOnlineChange(setOnline);
    void loadCurrentAssignment(user.uid).then((assignment) => {
      if (!assignment) { setMessage('No tenés una jornada asignada por coordinación.'); return; }
      const site: Site = assignment.expand?.site || { id: assignment.site, code: 'Sector asignado', name: 'Sector asignado' };
      const event: Event = assignment.expand?.event ? { ...assignment.expand.event, site: assignment.site } : { id: assignment.event, event_id: assignment.event, title: 'Jornada asignada', site: assignment.site };
      setSites([site]);
      setEvents([event]);
      setDraft((current) => ({ ...current, event: event.id, site: site.id }));
    });
    return unsubscribe;
  }, [user.uid]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setMessage('Este teléfono no ofrece geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const capturedAt = new Date().toISOString();
        setPosition({ coords: [coords.latitude, coords.longitude], accuracy: coords.accuracy, capturedAt });
        setMessage(`Ubicación capturada. Precisión estimada: ${Math.round(coords.accuracy)} m.`);
      },
      () => setMessage('No se pudo capturar la ubicación. El registro seguirá sin GPS.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasActiveLocalJourney(user.uid)) {
      setMessage('Iniciá una jornada activa antes de registrar una observación.');
      return;
    }
    if (!draft.event || !draft.site) {
      setMessage('La jornada todavía no tiene evento o sector asignado.');
      return;
    }
    setSaving(true);
    try {
      const photoData = photo ? await fileToDataUrl(photo) : undefined;
      const mediaHash = photoData ? await sha256(photoData) : undefined;
      if (draft.paper_id.trim() && online) {
        try {
          await pb.collection('occurrences').getFirstListItem(`paper_id = "${draft.paper_id.trim().replaceAll('"', '\\"')}"`);
          setMessage('Ese ID de ficha ya existe. Revisá el registro antes de continuar.');
          return;
        } catch {
          // A 404 means the paper ID is available. Other backend failures must not block an offline-capable draft.
        }
      }
      const territorialContext = position
        ? await matchParcel(position.coords[0], position.coords[1])
        : { status: 'indeterminate' as const, source: 'local' as const, checked_at: new Date().toISOString(), reason: 'La observación no tiene coordenadas GPS.' };
      const recordId = newLocalId(draft.record_type === 'impact' ? 'CHG' : 'BIO-MR');
      const observedAt = new Date().toISOString();
      const base = {
          event: draft.event, observer: user.uid, observed_at: observedAt,
          latitude: position?.coords[0] ?? null, longitude: position?.coords[1] ?? null,
          public_latitude: null, public_longitude: null,
          coordinate_uncertainty_m: position?.accuracy ?? null,
          location_source: position ? 'gps' : 'missing', location_captured_at: position?.capturedAt,
          public_visibility: 'private', record_version: 1, sync_status: online ? 'syncing' : 'local_only',
        };
      const payload = draft.record_type === 'impact'
        ? {
          territorialChange: {
            ...base, change_id: recordId, change_type: draft.impact_type,
            objective_description: draft.scientific_name.trim() || 'Cambio territorial observado',
            estimated_area_m2: Number(draft.quantity) || undefined, initial_severity: 'unknown', status: 'pending_review',
            notes: draft.notes.trim(),
          },
          media: photoData ? { dataUrl: photoData, sha256: mediaHash!, mediaId: newLocalId('MEDIA'), mimeType: photo?.type || 'image/jpeg', fileSize: photo?.size || 0 } : undefined,
        }
        : {
          occurrence: {
            ...base, occurrence_id: recordId, record_type: draft.record_type,
          geodetic_datum: 'WGS84', field_name: 'Biocorredor MR', paper_id: draft.paper_id.trim() || undefined,
          scientific_name: draft.scientific_name.trim() || 'Registro pendiente', scientific_name_proposed: draft.scientific_name.trim() || undefined,
          basis_of_record: 'HumanObservation',
          taxon_group: draft.record_type === 'biodiversity' ? draft.taxon_group : 'other', identification_qualifier: draft.identification_qualifier,
          quantity: Number(draft.quantity) || 1, quantity_unit: draft.count_method === 'cover' ? 'cover_percent' : 'individuals', count_method: draft.count_method,
          evidence_types: photoData ? ['photo'] : [], substrate: draft.substrate,
          microhabitat: draft.microhabitat, occurrence_status: 'detected', identification_status: 'unidentified',
          sensitive_record: draft.sensitive_record,
          completeness_status: photoData && position ? 'complete' : 'usable',
          notes: draft.notes.trim(), local_status: online ? 'syncing' : 'local_only',
          territorial_context_json: territorialContext,
          territorial_context_status: territorialContext.status,
          },
          media: photoData ? { dataUrl: photoData, sha256: mediaHash!, mediaId: newLocalId('MEDIA'), mimeType: photo?.type || 'image/jpeg', fileSize: photo?.size || 0 } : undefined,
        };
      await enqueueOp(draft.record_type === 'impact' ? 'territorial-change' : 'field-occurrence', payload);
      setMessage(online ? 'Registro guardado en la cola de sincronización.' : 'Registro guardado en este teléfono. Se sincronizará al volver la conexión.');
      setDraft({ ...emptyDraft, event: draft.event, site: draft.site });
      setPhoto(null); setPhotoPreview('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar el registro.');
    } finally { setSaving(false); }
  };

  const syncPending = async (ops: QueuedOp[]) => {
    const completed: string[] = [];
    for (const op of ops) {
      try {
        if (op.type === 'route-point') {
          const payload = op.payload as { routePoint: Record<string, unknown> };
          try { await pb.collection('route_points').create(payload.routePoint); }
          catch (error: any) { if (error?.status !== 400 && error?.status !== 409) throw error; }
        } else if (op.type === 'field-occurrence' || op.type === 'territorial-change') {
          const payload = op.payload as { occurrence?: Record<string, any>; territorialChange?: Record<string, any>; media?: { dataUrl: string; sha256: string; mediaId: string; mimeType: string; fileSize: number } };
          const collection = op.type === 'field-occurrence' ? 'occurrences' : 'territorial_changes';
          const key = op.type === 'field-occurrence' ? 'occurrence_id' : 'change_id';
          const record = payload.occurrence || payload.territorialChange!;
          let saved: any;
          try { saved = await pb.collection(collection).create(record); }
          catch (error: any) {
            if (error?.status !== 400 && error?.status !== 409) throw error;
            saved = await pb.collection(collection).getFirstListItem(`${key} = "${record[key]}"`);
          }
          if (payload.media) {
            const blob = await (await fetch(payload.media.dataUrl)).blob();
            const formData = new FormData();
            formData.append(op.type === 'field-occurrence' ? 'occurrence' : 'territorial_change', saved.id);
            formData.append('original_file', new File([blob], `${payload.media.mediaId}.jpg`, { type: payload.media.mimeType }));
            formData.append('sha256', payload.media.sha256); formData.append('mime_type', payload.media.mimeType);
            formData.append('file_size', String(payload.media.fileSize)); formData.append('media_type', 'photo');
            formData.append('is_original', 'true'); formData.append('sync_status', 'synced'); formData.append('created_by', user.uid);
            formData.append('original_local_blob_key', payload.media.sha256); formData.append('media_id', payload.media.mediaId);
            formData.append('ingested_at', new Date().toISOString());
            try { await pb.collection('media_evidence').create(formData); }
            catch (error: any) { if (error?.status !== 400 && error?.status !== 409) throw error; }
          }
        }
        completed.push(op.id);
      } catch { /* Keep only failed operations in the local queue for retry. */ }
    }
    return completed;
  };

  useEffect(() => {
    if (!online) return;
    const sync = async () => {
      const ops = await drainQueue();
      if (!ops.length) return;
      const completed = await syncPending(ops);
      await removeQueuedOps(completed);
      setMessage(completed.length === ops.length ? `${ops.length} registro(s) sincronizado(s).` : `${completed.length}/${ops.length} registro(s) sincronizado(s). Los demás quedan pendientes.`);
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
        <div className="grid gap-3 sm:grid-cols-2"><div className="border border-atlas-ink/20 px-3 py-3"><p className="font-mono text-[9px] uppercase opacity-50">Jornada asignada</p><p className="mt-1 font-sans text-sm">{selectedEvent?.title || 'Cargando jornada...'}</p></div><div className="border border-atlas-ink/20 px-3 py-3"><p className="font-mono text-[9px] uppercase opacity-50">Sector asignado</p><p className="mt-1 font-sans text-sm">{sites.find((site) => site.id === draft.site)?.code || 'Cargando sector...'}</p></div></div>
        {events.length > 1 && <label className="block font-sans text-xs font-bold uppercase tracking-wider">Cambiar jornada<select value={draft.event} onChange={(e) => update('event', e.target.value)} className="atlas-input mt-2 w-full" required><option value="">Seleccionar evento</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title || item.event_id}</option>)}</select></label>}
        {sites.length > 1 && <label className="block font-sans text-xs font-bold uppercase tracking-wider">Cambiar sector<select value={draft.site} onChange={(e) => update('site', e.target.value)} className="atlas-input mt-2 w-full" required><option value="">Seleccionar sector</option>{sites.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>}
        <fieldset><legend className="mb-2 font-sans text-xs font-bold uppercase tracking-wider">Qué estás registrando</legend><div className="grid grid-cols-3 gap-2">{([['biodiversity', 'Biodiversidad'], ['habitat', 'Ambiente'], ['impact', 'Impacto']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => update('record_type', value)} className={`border px-2 py-3 font-sans text-xs ${draft.record_type === value ? 'border-atlas-ink bg-atlas-ink text-atlas-paper' : 'border-atlas-ink/25'}`}>{label}</button>)}</div></fieldset>
        <div className="grid grid-cols-2 gap-4"><label className="block font-sans text-xs font-bold uppercase tracking-wider">{draft.record_type === 'biodiversity' ? 'Organismo o grupo' : draft.record_type === 'impact' ? 'Descripción objetiva' : 'Ambiente observado'}<input value={draft.scientific_name} onChange={(e) => update('scientific_name', e.target.value)} placeholder={draft.record_type === 'biodiversity' ? 'Pendiente si no se conoce' : draft.record_type === 'impact' ? 'Qué se observa, sin interpretar legalmente' : 'Humedal, bosque, pastizal...'} className="atlas-input mt-2 w-full" /></label><label className="block font-sans text-xs font-bold uppercase tracking-wider">Cantidad o extensión<input type="number" min="1" value={draft.quantity} onChange={(e) => update('quantity', e.target.value)} className="atlas-input mt-2 w-full" /></label></div>
        {draft.record_type === 'impact' && <label className="block font-sans text-xs font-bold uppercase tracking-wider">Tipo de cambio territorial<select value={draft.impact_type} onChange={(e) => update('impact_type', e.target.value)} className="atlas-input mt-2 w-full"><option value="other">Otro</option><option value="construction">Obra</option><option value="filling">Relleno</option><option value="clearing">Desmonte</option><option value="soil_movement">Movimiento de suelo</option><option value="road_opening">Apertura de calle</option><option value="fencing">Cercamiento</option><option value="watercourse_change">Cambio en curso de agua</option><option value="vegetation_loss">Pérdida de vegetación</option></select></label>}
        {draft.record_type === 'biodiversity' && <div className="grid gap-4 sm:grid-cols-3"><label className="block font-sans text-xs font-bold uppercase tracking-wider">Grupo<select value={draft.taxon_group} onChange={(e) => update('taxon_group', e.target.value)} className="atlas-input mt-2 w-full"><option value="plant">Planta</option><option value="bird">Ave</option><option value="mammal">Mamífero</option><option value="reptile">Reptil</option><option value="amphibian">Anfibio</option><option value="arthropod">Artrópodo</option><option value="fungi">Hongo / funga</option><option value="other">Otro</option></select></label><label className="block font-sans text-xs font-bold uppercase tracking-wider">Calificador<select value={draft.identification_qualifier} onChange={(e) => update('identification_qualifier', e.target.value)} className="atlas-input mt-2 w-full"><option value="unknown">No sé</option><option value="sp">sp.</option><option value="cf">cf.</option><option value="aff">aff.</option><option value="tentative">Tentativa</option><option value="probable">Probable</option></select></label><label className="block font-sans text-xs font-bold uppercase tracking-wider">Conteo<select value={draft.count_method} onChange={(e) => update('count_method', e.target.value)} className="atlas-input mt-2 w-full"><option value="estimated">Estimado</option><option value="exact">Exacto</option><option value="range">Rango</option><option value="cover">Cobertura %</option></select></label></div>}
        <div className="grid grid-cols-2 gap-4"><label className="block font-sans text-xs font-bold uppercase tracking-wider">Sustrato o referencia<input value={draft.substrate} onChange={(e) => update('substrate', e.target.value)} placeholder="Suelo, tronco, camino..." className="atlas-input mt-2 w-full" /></label><label className="block font-sans text-xs font-bold uppercase tracking-wider">Condición del lugar<input value={draft.microhabitat} onChange={(e) => update('microhabitat', e.target.value)} placeholder="Sombra, humedad, acceso..." className="atlas-input mt-2 w-full" /></label></div>
        <label className="block font-sans text-xs font-bold uppercase tracking-wider">ID de ficha / QR <span className="font-normal normal-case opacity-50">(opcional)</span><input value={draft.paper_id} onChange={(e) => update('paper_id', e.target.value.toUpperCase())} placeholder="MR-20260815-P001" className="atlas-input mt-2 w-full" /></label>
        <label className="block font-sans text-xs font-bold uppercase tracking-wider">Nota breve <span className="font-normal normal-case opacity-50">(opcional)</span><textarea value={draft.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Qué viste o qué cambió" className="mt-2 min-h-24 w-full border border-atlas-ink bg-transparent p-3 font-sans text-sm focus:outline-none focus:ring-2 focus:ring-atlas-earth" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={locate} className="atlas-button inline-flex items-center justify-center gap-2"><MapPin className="h-4 w-4" />{position ? `${position.coords[0].toFixed(4)}, ${position.coords[1].toFixed(4)}` : 'Capturar ubicación'}</button><label className="atlas-button inline-flex cursor-pointer items-center justify-center gap-2"><Camera className="h-4 w-4" />{photo ? 'Cambiar foto' : 'Agregar foto original'}<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { setPhoto(file); setPhotoPreview(await fileToDataUrl(file)); } }} /></label></div>
        <p className={`font-mono text-[10px] uppercase tracking-wider ${!position ? 'text-atlas-ink/55' : position.accuracy <= 15 ? 'text-emerald-700' : position.accuracy <= 50 ? 'text-amber-700' : 'text-red-700'}`}>{!position ? 'GPS pendiente · se puede guardar sin coordenadas' : position.accuracy <= 15 ? `GPS preciso · ±${Math.round(position.accuracy)} m` : position.accuracy <= 50 ? `GPS aceptable · ±${Math.round(position.accuracy)} m` : `GPS impreciso · ±${Math.round(position.accuracy)} m`}</p>
        {photoPreview && <img src={photoPreview} alt="Vista previa de la evidencia" className="max-h-56 w-full object-cover" />}
        <label className="flex items-start gap-3 border border-atlas-ink/20 p-3 font-sans text-xs"><input type="checkbox" checked={draft.sensitive_record === 'true'} onChange={(e) => update('sensitive_record', e.target.checked ? 'true' : 'false')} className="mt-0.5" /><span><span className="flex items-center gap-1 font-bold"><ShieldAlert className="h-4 w-4" /> Registro sensible</span><span className="mt-1 block opacity-70">Oculta la ubicación precisa y limita la visibilidad al equipo.</span></span></label>
        {message && <p className="border-l-4 border-atlas-earth px-3 py-2 font-sans text-sm">{message}</p>}
        <button disabled={saving || !selectedEvent} className="flex w-full items-center justify-center gap-2 bg-atlas-ink px-4 py-4 font-sans text-xs font-black uppercase tracking-[0.18em] text-atlas-paper hover:bg-atlas-earth disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4" /> Guardar relevamiento</>}</button>
        <p className="text-center font-mono text-[10px] uppercase tracking-wider opacity-45"><Check className="mr-1 inline h-3 w-3" /> La evidencia original queda asociada al registro</p>
      </form>
    </div>
  </div>;
}
