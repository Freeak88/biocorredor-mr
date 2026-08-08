import React, { useEffect, useState } from 'react';
import { ArrowLeft, Camera, Clock3, FileText, X } from 'lucide-react';
import { listLocalMedia } from '../lib/mediaEvidence';
import { listLocalSyncEntities, type SyncEntity } from '../lib/remoteSync';

export default function FieldRecordsPanel({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<SyncEntity[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    let disposed = false;
    void Promise.all([listLocalSyncEntities(), listLocalMedia()]).then(([entities, media]) => {
      if (disposed) return;
      const useful = entities.filter((entity) => entity.data?.occurrence_id || entity.data?.change_id || entity.data?.paper_id || entity.data?.organism_group || entity.data?.organism_name);
      setRecords(useful.sort((a, b) => b.local_updated_at.localeCompare(a.local_updated_at)));
      const urls = Object.fromEntries(media.map((item) => [item.parent_local_id, URL.createObjectURL(item.blob)]));
      setThumbs(urls);
    });
    return () => { disposed = true; };
  }, []);
  return <div className="fixed inset-0 z-[2500] flex flex-col bg-atlas-paper">
    <header className="flex items-center justify-between border-b-2 border-atlas-ink bg-atlas-paper px-4 py-3">
      <div className="flex items-center gap-3"><button onClick={onClose} className="flex h-11 w-11 items-center justify-center" title="Volver"><ArrowLeft className="h-5 w-5" /></button><div><h2 className="font-serif text-lg italic">Mis registros</h2><p className="text-[9px] font-black uppercase tracking-widest opacity-50">Disponibles en este dispositivo</p></div></div>
      <button onClick={onClose} className="flex h-11 w-11 items-center justify-center" title="Cerrar"><X className="h-5 w-5" /></button>
    </header>
    <div className="flex-1 overflow-y-auto p-4 sm:p-8"><div className="mx-auto grid max-w-3xl gap-3">
      {records.length === 0 ? <div className="py-20 text-center font-serif italic opacity-50">Todavía no hay registros guardados en este dispositivo.</div> : records.map((record) => {
        const data = record.data || {};
        const title = data.organism_group || data.organism_name || data.name || data.type || 'Registro de campo';
        return <article key={record.sync_key} className="flex gap-3 border border-atlas-ink/15 bg-white p-3">
          {thumbs[record.local_id] ? <img src={thumbs[record.local_id]} alt="" className="h-16 w-16 shrink-0 object-cover" /> : <div className="flex h-16 w-16 shrink-0 items-center justify-center bg-atlas-stone/40"><Camera className="h-5 w-5 opacity-40" /></div>}
          <div className="min-w-0 flex-1"><h3 className="truncate font-serif text-lg italic">{title}</h3><p className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wider opacity-60"><Clock3 className="h-3 w-3" /> {new Date(data.observed_at || data.captured_at || record.local_updated_at).toLocaleString('es-AR')}</p><p className="mt-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider"><FileText className="h-3 w-3" /> {record.sync_status === 'synced' ? 'Sincronizado' : 'Guardado en este dispositivo'}</p></div>
        </article>;
      })}
    </div></div>
  </div>;
}
