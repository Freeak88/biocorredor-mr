import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Sprout, Wind, Database, Info, ShieldCheck, MessageSquare, Send, User as UserIcon, Flag, LeafyGreen } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { pb, getFileURL, sortByDateDesc, withAuthRefresh } from '../lib/pb';
import { Sighting, Comment, UserProfile, AuthUser } from '../types';
import { useSpeciesStats } from '../hooks/useSpeciesStats';

interface SightingDetailProps {
  selectedSighting: Sighting | null;
  onClose: () => void;
  user: AuthUser | null;
  userLocation: [number, number] | null;
  currentUserProfile: UserProfile | null;
  sightings: Sighting[];
  onReport: (type: 'sighting' | 'comment', targetId: string, content?: string) => void;
  onGeofirm: (s: Sighting) => void;
  createLog: (action: string, details: string) => Promise<void>;
  activeGalleryIndex: number | null;
  setActiveGalleryIndex: (idx: number | null) => void;
}

function parseDate(d: any): Date {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  if (typeof d === 'string') return parseISO(d);
  if (typeof d.toDate === 'function') return d.toDate();
  return new Date(d);
}

function getImageUrl(s: Sighting, index: number = 0): string {
  if (s.images && s.images.length > index) {
    const filename = s.images[index];
    // If it's already a full URL (data: or http), return as-is
    if (filename.startsWith('data:') || filename.startsWith('http')) return filename;
    // Otherwise it's a PocketBase file reference
    return getFileURL(s as any, filename);
  }
  return s.imageUrl || '';
}

const MONTH_LABELS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function SpeciesProfile({ sighting, allSightings }: { sighting: Sighting; allSightings: Sighting[] }) {
  const mushroomName = sighting.mushroomName || sighting.mushroom_name || '';
  const stats = useSpeciesStats(mushroomName, allSightings);
  const currentMonth = new Date().getMonth();
  const maxCount = Math.max(...stats.monthlyData, 1);

  const toxicityClass =
    sighting.toxicity === 'Comestible' ? 'toxicity-badge--comestible' :
    sighting.toxicity === 'Tóxico' ? 'toxicity-badge--toxico' :
    sighting.toxicity === 'Mortal' ? 'toxicity-badge--mortal' : null;

  const toxicityIcon =
    sighting.toxicity === 'Comestible' ? '🌿' :
    sighting.toxicity === 'Tóxico' ? '⚠️' :
    sighting.toxicity === 'Mortal' ? '💀' : null;

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return format(d, 'dd/MM/yyyy', { locale: es });
  };

  if (stats.totalCount === 0) return null;

  return (
    <div className="species-profile">
      {/* Header */}
      <div className="species-profile-header">
        <p className="species-sci-name">{mushroomName}</p>
        {mushroomName && (
          <p className="species-common-name">Perfil de Especie · {stats.totalCount} {stats.totalCount === 1 ? 'observación' : 'observaciones'}</p>
        )}
      </div>

      {/* Toxicity badge */}
      {toxicityClass && (
        <div className={`toxicity-badge ${toxicityClass}`}>
          <div className="toxicity-badge-icon">{toxicityIcon}</div>
          <div className="toxicity-badge-label">{sighting.toxicity}</div>
        </div>
      )}

      {/* Seasonality chart */}
      <div className="seasonality-chart">
        <p className="seasonality-chart-title">Frecuencia de observaciones por mes</p>
        <div className="seasonality-bars">
          {stats.monthlyData.map((count, i) => {
            const isCurrent = i === currentMonth;
            const height = count > 0 ? Math.max((count / maxCount) * 68, 4) : 2;
            return (
              <div key={i} className="seasonality-bar-wrapper" title={`${MONTH_NAMES[i]}: ${count} observaciones`}>
                <div className="seasonality-bar-count">{count > 0 ? count : ''}</div>
                <div
                  className={`seasonality-bar ${count > 0 ? 'has-data' : ''} ${isCurrent ? 'current-month' : ''}`}
                  style={{ height: `${height}px` }}
                />
                <div className={`seasonality-bar-label ${isCurrent ? 'current-month' : ''}`}>
                  {MONTH_LABELS[i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats grid */}
      <div className="species-stats-grid">
        <div className="species-stat-card">
          <p className="stat-label">Total Observaciones</p>
          <p className="stat-value">{stats.totalCount}</p>
        </div>
        <div className="species-stat-card">
          <p className="stat-label">Rango Latitudinal</p>
          <p className="stat-value">{stats.latRange ? `${stats.latRange[0].toFixed(2)}° – ${stats.latRange[1].toFixed(2)}°` : '—'}</p>
        </div>
        <div className="species-stat-card">
          <p className="stat-label">Primera Observación</p>
          <p className="stat-value">{formatDate(stats.firstSeen)}</p>
        </div>
        <div className="species-stat-card">
          <p className="stat-label">Última Observación</p>
          <p className="stat-value">{formatDate(stats.lastSeen)}</p>
        </div>
      </div>

      {/* Legal disclaimer */}
      <div className="species-disclaimer">
        ⚠️ La información de toxicidad es orientativa y proviene de fuentes públicas. Nunca consuma un hongo silvestre sin la verificación de un micólogo experto. Funga Map no se responsabiliza por identificaciones incorrectas.
      </div>
    </div>
  );
}

export default function SightingDetail({
  selectedSighting,
  onClose,
  user,
  userLocation,
  currentUserProfile,
  sightings,
  onReport,
  onGeofirm,
  createLog,
  activeGalleryIndex,
  setActiveGalleryIndex
}: SightingDetailProps) {
  const [sightingComments, setSightingComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzingColors, setAnalyzingColors] = useState(false);

  useEffect(() => {
    if (!selectedSighting) {
      setSightingComments([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Load initial comments
        const comments = await pb.collection('comments').getFullList({
          filter: `sighting = "${selectedSighting.id}"`,
          expand: 'user',
        });
        if (!cancelled) {
          setSightingComments(sortByDateDesc(comments).reverse().map(c => ({
            ...c,
            userName: (c as any).expand?.user?.name || '',
            userPhoto: (c as any).expand?.user?.avatar ? getFileURL((c as any).expand.user, (c as any).expand.user.avatar) : '',
          })) as unknown as Comment[]);
        }

        // Subscribe to realtime comments
        await pb.collection('comments').subscribe('*', (e) => {
          if (cancelled) return;
          // Only process comments for this sighting
          if (e.record.sighting !== selectedSighting.id) return;

          if (e.action === 'delete') {
            setSightingComments(prev => prev.filter(c => c.id !== e.record.id));
          } else {
            const expanded = {
              ...e.record,
              userName: (e.record as any).expand?.user?.name || '',
              userPhoto: (e.record as any).expand?.user?.avatar ? getFileURL((e.record as any).expand.user, (e.record as any).expand.user.avatar) : '',
            } as unknown as Comment;
            setSightingComments(prev => {
              const idx = prev.findIndex(c => c.id === e.record.id);
              if (idx >= 0) { const n = [...prev]; n[idx] = expanded; return n; }
              return [...prev, expanded];
            });
          }
        }, { filter: `sighting = "${selectedSighting.id}"` });
      } catch (err) {
        console.error("Comments load error", err);
      }
    })();

    return () => {
      cancelled = true;
      pb.collection('comments').unsubscribe('*').catch(() => {});
    };
  }, [selectedSighting]);

  useEffect(() => {
    if (!selectedSighting) return;
    setAiAnalysis(null);
    setAnalyzingColors(true);
    const timer = setTimeout(() => setAnalyzingColors(false), 500);
    return () => clearTimeout(timer);
  }, [selectedSighting]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedSighting || !newComment.trim()) return;
    try {
      await withAuthRefresh(() => pb.collection('comments').create({
        sighting: selectedSighting.id,
        user: user.uid,
        text: newComment.trim(),
      }));

      if (currentUserProfile) {
        await pb.collection('users').update(user.uid, {
          points: (currentUserProfile.points || 0) + 2,
        });
      }
      setNewComment('');
      const name = selectedSighting.mushroomName || selectedSighting.mushroom_name || '';
      await createLog('comment_add', `Comentó en el hallazgo "${name}"`);
    } catch (err) {
      console.error("Error adding comment", err);
    }
  };

  if (!selectedSighting) return null;

  const s = selectedSighting;
  const mushroomName = s.mushroomName || s.mushroom_name || '';
  const networkId = s.networkId || s.network_id || '';
  const userId = typeof s.user === 'string' ? s.user : (s.user as any)?.id || s.userId;

  return (
    <AnimatePresence>
      <>
        <div className="fixed inset-0 bg-atlas-ink/40 backdrop-blur-sm z-[1000] md:hidden" onClick={onClose} />
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed md:absolute top-0 right-0 bottom-0 w-full md:w-[420px] bg-atlas-paper z-[1001] shadow-2xl border-l border-atlas-ink flex flex-col overflow-hidden"
        >
          <div className="relative h-64 bg-atlas-stone flex flex-col items-center justify-center border-b border-atlas-ink overflow-hidden group shrink-0">
            {getImageUrl(s) ? (
              <img src={getImageUrl(s)} alt={mushroomName} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
            ) : (
              <div className="absolute inset-0 dotted-bg [background-size:10px_10px]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-atlas-paper via-atlas-paper/20 to-transparent" />
            <button onClick={onClose} className="absolute top-4 right-4 z-20 p-2 bg-atlas-paper/80 backdrop-blur hover:bg-atlas-ink hover:text-atlas-paper rounded-full text-atlas-ink transition-all shadow-md">
              <Plus className="w-5 h-5 rotate-45" />
            </button>
            <div className="relative z-10 flex flex-col items-center gap-3 mt-12">
              <div onClick={() => ((s.images && s.images.length > 0) || getImageUrl(s)) && setActiveGalleryIndex(0)} className="w-24 h-24 border-4 border-atlas-paper rounded-full flex items-center justify-center bg-atlas-paper shadow-xl overflow-hidden cursor-pointer hover:scale-110 transition-transform">
                {getImageUrl(s) ? (
                  <img src={getImageUrl(s)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Sprout className="w-10 h-10 opacity-40 text-atlas-ink" />
                )}
              </div>
              <div className="px-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-sans font-black uppercase tracking-widest border ${
                    s.status === 'expert_verified' ? 'bg-atlas-earth text-atlas-paper border-atlas-earth' :
                    s.status === 'identified' ? 'bg-atlas-stone text-atlas-ink border-atlas-ink/20' :
                    'bg-atlas-paper text-atlas-ink/40 border-atlas-ink/10'
                  }`}>
                    {s.status === 'expert_verified' ? 'Verificado por Experto' :
                     s.status === 'identified' ? 'Identificado' : 'Encuentro Fugaz'}
                  </span>
                  {s.toxicity && (
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-sans font-black uppercase tracking-widest border ${
                      s.toxicity === 'Comestible' ? 'bg-green-100 text-green-800 border-green-200' :
                      s.toxicity === 'Tóxico' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                      s.toxicity === 'Mortal' ? 'bg-red-100 text-red-800 border-red-200' :
                      'bg-stone-100 text-stone-800 border-stone-200'
                    }`}>
                      {s.toxicity}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-sans font-black uppercase tracking-[0.3em] text-atlas-earth mb-1">Registro de Campo</p>
                <h2 className="text-2xl md:text-3xl italic font-serif leading-tight text-atlas-ink">{mushroomName}</h2>
                <p className="text-[9px] font-sans opacity-40 uppercase tracking-widest mt-2">{s.userName} • {format(parseDate(s.created || s.createdAt), 'yyyy', { locale: es })} ATLAS</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 pb-[calc(2rem+env(safe-area-inset-bottom))] md:p-10 space-y-10 font-serif">
            {s.images && s.images.length > 1 && (
              <section>
                <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.2em] flex items-center gap-3">
                  <Wind className="w-4 h-4 opacity-40" /> Archivo Fotográfico ({s.images.length})
                </h4>
                <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
                  {s.images.map((img, idx) => (
                    <div key={idx} onClick={() => setActiveGalleryIndex(idx)} className="shrink-0 w-24 h-24 border border-atlas-ink/10 rounded overflow-hidden cursor-pointer hover:border-atlas-earth transition-all shadow-sm">
                      <img src={getImageUrl(s, idx)} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {networkId && (
              <section className="bg-atlas-stone/10 p-6 border border-atlas-ink/5 rounded-lg">
                <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.2em] flex items-center gap-3">
                  <Database className="w-4 h-4 opacity-40" /> Ciclos del Micelio
                </h4>
                <div className="space-y-4">
                  <p className="text-[11px] italic opacity-60 leading-relaxed">Este espécimen pertenece a una colonia registrada anteriormente. El Atlas reconoce su recurrencia estacional.</p>
                  <div className="space-y-2">
                    {sightings
                      .filter(si => ((si.networkId || si.network_id) === networkId || si.id === networkId) && si.id !== s.id)
                      .map(hist => (
                        <div key={hist.id} className="flex items-center gap-3 p-2 hover:bg-atlas-stone transition-all cursor-pointer rounded">
                          <div className="w-10 h-10 rounded border border-atlas-ink/10 overflow-hidden shrink-0">
                            <img src={getImageUrl(hist)} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] italic font-bold truncate">{format(parseDate(hist.created || hist.createdAt), 'MMMM yyyy', { locale: es })}</p>
                            <p className="text-[8px] opacity-40 uppercase truncate">ID: {hist.id.slice(0, 8)}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            )}

            <section className="bg-atlas-stone/20 p-6 space-y-4 border border-atlas-ink/5 rounded-lg shrink-0">
              <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase tracking-[0.2em] flex items-center gap-3">
                <Info className="w-4 h-4 opacity-40" /> Metadatos del Archivo
              </h4>
              <div className="grid grid-cols-2 gap-6 font-mono text-[9px] uppercase tracking-wider opacity-60">
                <div><p className="opacity-40 mb-1">Coordenadas</p><p>{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</p></div>
                <div><p className="opacity-40 mb-1">Fecha Registro</p><p>{format(parseDate(s.created || s.createdAt), 'dd/MM/yyyy HH:mm')}</p></div>
                <div><p className="opacity-40 mb-1">Toxicidad</p><p className={s.toxicity === 'Mortal' ? 'text-red-600 font-black' : ''}>{s.toxicity || 'Desconocida'}</p></div>
                <div><p className="opacity-40 mb-1">Estado</p><p className="lowercase">{s.status}</p></div>
              </div>
              {(s.geofirmed_at || s.lastGeofirmedAt) && (
                <div className="pt-4 border-t border-atlas-ink/5 flex items-center gap-3 text-[9px] italic opacity-40">
                  <ShieldCheck className="w-3 h-3 text-atlas-earth" />
                  Geofirmado in situ el {format(parseDate(s.geofirmed_at || s.lastGeofirmedAt), 'dd/MM/yy')}
                </div>
              )}
            </section>

            <section>
              <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.2em] flex items-center gap-3">
                <div className="w-2 h-2 bg-atlas-earth rounded-full" /> Observaciones de Sujeto
              </h4>
              <p className="text-lg text-atlas-ink leading-relaxed italic border-l-2 border-atlas-stone pl-6 py-2">"{s.description}"</p>
              {userId !== user?.uid && (
                <button onClick={() => onReport('sighting', s.id, s.description)} className="mt-6 inline-flex items-center gap-2 border border-red-900/20 bg-red-50 px-3 py-2 text-[9px] font-sans font-black text-red-900 hover:bg-red-900 hover:text-atlas-paper transition-colors uppercase tracking-[0.2em]">
                  <Flag className="w-3 h-3" /> Reportar Inexactitud o Abuso
                </button>
              )}
            </section>

            {(s.habitat || s.features) && (
              <section className="space-y-6">
                <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-2 tracking-[0.2em] flex items-center gap-3">
                  <LeafyGreen className="w-4 h-4 opacity-40" /> Detalles Botánicos
                </h4>
                <div className="grid gap-6">
                  {s.habitat && (
                    <div className="bg-atlas-stone/10 p-4 border-l-2 border-atlas-earth">
                      <p className="text-[9px] font-sans font-black uppercase tracking-widest opacity-40 mb-1">Hábitat Sugerido</p>
                      <p className="text-xs italic leading-relaxed opacity-80">{s.habitat}</p>
                    </div>
                  )}
                  {s.features && (
                    <div className="bg-atlas-stone/10 p-4 border-l-2 border-atlas-earth">
                      <p className="text-[9px] font-sans font-black uppercase tracking-widest opacity-40 mb-1">Rasgos Distintivos</p>
                      <p className="text-xs italic leading-relaxed opacity-80">{s.features}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="relative">
              <div className="flex items-center justify-between mb-4 border-b border-atlas-ink/10 pb-2">
                <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase tracking-[0.2em]">Conclusiones del Herbario (AI)</h4>
                {analyzingColors && (
                  <div className="flex gap-1">
                    <div className="w-1 h-1 bg-atlas-earth rounded-full animate-bounce" />
                    <div className="w-1 h-1 bg-atlas-earth rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1 h-1 bg-atlas-earth rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
              </div>
              <div className={`text-sm leading-relaxed transition-all ${analyzingColors ? 'opacity-30' : 'opacity-100'}`}>
                {aiAnalysis ? (
                  <div className="prose prose-sm prose-slate italic opacity-80 leading-loose">{aiAnalysis}</div>
                ) : (
                  <p className="text-center italic opacity-40 py-10">Consultando archivos antiguos...</p>
                )}
              </div>
            </section>

            <section className="pt-8 border-t border-atlas-ink/10">
              <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-6 tracking-[0.2em] flex items-center gap-3">
                <MessageSquare className="w-4 h-4 opacity-40" /> Comunidad y Diálogo
              </h4>

              {s.status === 'draft' && (
                <div className="mb-8 p-6 bg-atlas-earth/5 border-2 border-dashed border-atlas-earth/40 rounded-lg">
                  <h5 className="text-sm font-serif italic mb-2">Protocolo de Geofirmación</h5>
                  <p className="text-[10px] text-atlas-ink/60 mb-6 leading-relaxed">Este ejemplar fue registrado de forma remota. Para validarlo, acérquese a las coordenadas y documente el espécimen nuevamente.</p>
                  <div className="space-y-4">
                    <div className="bg-atlas-paper border border-atlas-ink/10 p-4 text-center cursor-pointer hover:bg-atlas-stone transition-all relative overflow-hidden group">
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" />
                      <div className="flex flex-col items-center gap-2 py-2">
                        <Plus className="w-5 h-5 text-atlas-earth group-hover:scale-110 transition-transform" />
                        <span className="text-[9px] font-sans font-black uppercase tracking-widest opacity-60">Subir Fotografía de Campo</span>
                      </div>
                    </div>
                    <button onClick={() => onGeofirm(s)} className="w-full atlas-button bg-atlas-earth text-atlas-paper border-atlas-earth hover:bg-atlas-ink py-4">
                      Geofirmar (Detección In Situ)
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {sightingComments.length === 0 ? (
                  <p className="text-center italic opacity-40 text-xs py-4">Aún no hay archivos de discusión para este ejemplar.</p>
                ) : (
                  sightingComments.map(c => (
                    <div key={c.id} className="space-y-2 group">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          {c.userPhoto ? (
                            <img src={c.userPhoto} alt="" className="w-4 h-4 rounded-full border border-atlas-ink/10" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-atlas-stone border border-atlas-ink/10 flex items-center justify-center">
                              <UserIcon className="w-2 h-2" />
                            </div>
                          )}
                          <span className="text-[9px] font-sans font-black uppercase tracking-widest text-atlas-ink/60">{c.userName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[8px] font-mono opacity-30">{format(parseDate(c.created), 'HH:mm', { locale: es })}</span>
                          {c.user !== user?.uid && (
                            <button onClick={() => onReport('comment', c.id, c.text)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] font-sans font-black text-red-800 uppercase tracking-widest">
                              Denunciar
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-[13px] text-atlas-ink opacity-80 pl-6 border-l border-atlas-earth/20 leading-relaxed italic">"{c.text}"</p>
                    </div>
                  ))
                )}
              </div>

              {user && (
                <form onSubmit={handleAddComment} className="mt-8 relative mb-12">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Agregar observación..."
                    className="w-full bg-atlas-stone/30 border-b border-atlas-ink/10 py-3 pr-10 text-xs italic focus:outline-none focus:border-atlas-earth transition-all placeholder:opacity-30"
                  />
                  <button type="submit" disabled={!newComment.trim()} className="absolute right-0 top-1/2 -translate-y-1/2 text-atlas-earth hover:text-atlas-ink disabled:opacity-20 transition-all p-2">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </section>
          </div>
        </motion.div>
      </>
    </AnimatePresence>
  );
}
