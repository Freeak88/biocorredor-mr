import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Plus, Bell, AlertTriangle, Sprout, MessageSquare, Navigation, User as UserIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getFileURL } from '../lib/pb';
import { ActionLog, Report, UserProfile } from '../types';

function parseDate(d: any): Date {
  if (!d) return new Date();
  if (d instanceof Date) return d;
  if (typeof d === 'string') return parseISO(d);
  if (typeof d.toDate === 'function') return d.toDate();
  return new Date(d);
}

interface AdminPanelProps {
  showAdminPanel: boolean;
  setShowAdminPanel: (v: boolean) => void;
  isAdmin: boolean;
  logs: ActionLog[];
  reports: Report[];
  allUsers: UserProfile[];
  onlineUsers: UserProfile[];
  activeAdminTab: 'logs' | 'reports';
  setActiveAdminTab: (tab: 'logs' | 'reports') => void;
  handleSendMessage: (text: string) => void;
  createLog: (action: string, details: string) => Promise<void>;
}

export default function AdminPanel({
  showAdminPanel,
  setShowAdminPanel,
  isAdmin,
  logs,
  reports,
  allUsers,
  onlineUsers,
  activeAdminTab,
  setActiveAdminTab,
  handleSendMessage,
  createLog
}: AdminPanelProps) {
  if (!showAdminPanel || !isAdmin) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="absolute inset-12 bg-atlas-paper z-[2000] shadow-atlas border border-atlas-ink flex flex-col overflow-hidden"
      >
        <div className="p-8 bg-atlas-ink text-atlas-paper flex justify-between items-center relative overflow-hidden">
          <div className="absolute inset-0 dotted-bg opacity-10" />
          <div className="flex items-center gap-4 relative z-10">
            <ShieldCheck className="w-10 h-10 text-atlas-earth" />
            <div>
              <h2 className="text-2xl italic font-serif tracking-tight">Estación de Control</h2>
              <p className="text-[10px] font-sans font-black uppercase tracking-[0.3em] opacity-40 leading-none mt-1 italic">Vigilancia del Atlas .03</p>
            </div>
          </div>
          <button onClick={() => setShowAdminPanel(false)} className="p-2 hover:bg-atlas-paper/20 rounded-full transition-colors relative z-10">
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          <div className="w-full md:w-[320px] border-r border-atlas-ink/10 p-8 space-y-8 overflow-y-auto bg-atlas-paper">
            <div className="flex flex-col gap-4">
              <div className="atlas-card !p-6 border-l-4 border-l-atlas-ink">
                <p className="text-[10px] font-sans font-black text-atlas-ink/40 uppercase mb-2 tracking-widest">Colaboradores</p>
                <p className="text-4xl italic font-serif">{allUsers.length}</p>
              </div>
              <div className="atlas-card !p-6 border-l-4 border-l-atlas-earth">
                <p className="text-[10px] font-sans font-black text-atlas-ink/40 uppercase mb-2 tracking-widest">Almas en Línea</p>
                <p className="text-4xl italic font-serif">{onlineUsers.length}</p>
              </div>
            </div>

            <section>
              <h4 className="text-[10px] font-sans font-black text-atlas-ink uppercase mb-4 tracking-[0.3em] flex items-center gap-3">
                <div className="w-2 h-2 bg-atlas-earth rounded-full" /> Cartógrafos
              </h4>
              <div className="space-y-4">
                {allUsers.slice(0, 5).map(u => {
                  const avatarUrl = u.avatar ? getFileURL(u as any, u.avatar) : u.photoURL;
                  const displayName = u.displayName || u.name;
                  return (
                    <div key={u.id} className="group flex items-center gap-3 p-3 hover:bg-atlas-stone transition-colors border-b border-atlas-ink/5">
                      {avatarUrl ? <img src={avatarUrl} alt="" className="w-8 h-8 grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all border border-atlas-ink rounded-full" referrerPolicy="no-referrer" /> : <div className="w-8 h-8 rounded-full bg-atlas-stone border border-atlas-ink" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-serif italic truncate">{displayName}</p>
                        <p className="text-[9px] font-mono opacity-30 truncate">{u.email}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="bg-atlas-ink text-atlas-paper p-8 mt-auto rounded-tl-[60px]">
              <h4 className="text-[10px] font-sans font-black uppercase mb-4 tracking-[0.3em] flex items-center gap-2">
                <Bell className="w-3 h-3 opacity-40" /> Boletín del Atlas
              </h4>
              <p className="text-[11px] font-serif italic opacity-60 mb-4 leading-relaxed">Emita una directiva global para todos los inspectores en campo.</p>
              <form className="flex flex-col gap-4" onSubmit={(e) => {
                e.preventDefault();
                const input = (e.target as any).elements.namedItem('note') as HTMLInputElement;
                if (input.value.trim()) {
                  handleSendMessage(`[DIRECTIVA ATLAS]: ${input.value}`);
                  createLog('admin_broadcast', input.value);
                  input.value = '';
                }
              }}>
                <input
                  name="note"
                  placeholder="Contenido de la directiva..."
                  className="bg-transparent border-b border-atlas-paper/20 py-2 text-xs font-sans focus:outline-none focus:border-atlas-paper"
                />
                <button type="submit" className="border border-atlas-paper py-2 text-[10px] font-sans font-black uppercase tracking-[0.2em] hover:bg-atlas-paper hover:text-atlas-ink transition-colors">Confirmar Aviso</button>
              </form>
            </section>
          </div>

          <div className="hidden md:flex flex-1 flex-col overflow-hidden bg-atlas-paper">
            <div className="flex border-b border-atlas-ink/10 p-8 gap-12">
              <button
                onClick={() => setActiveAdminTab('logs')}
                className={`text-[11px] font-sans font-black uppercase tracking-[0.3em] pb-2 transition-all ${activeAdminTab === 'logs' ? 'text-atlas-ink border-b border-atlas-ink' : 'text-atlas-ink/30 hover:text-atlas-ink'}`}
              >
                REGISTRO DE ACTIVIDAD
              </button>
              <button
                onClick={() => setActiveAdminTab('reports')}
                className={`text-[11px] font-sans font-black uppercase tracking-[0.3em] pb-2 transition-all flex items-center gap-3 ${activeAdminTab === 'reports' ? 'text-atlas-earth border-b border-atlas-earth' : 'text-atlas-ink/30 hover:text-atlas-ink'}`}
              >
                INCIDENCIAS {reports.length > 0 && <span className="text-[10px] italic">({reports.length})</span>}
              </button>
            </div>

            <div className="flex-1 p-8 overflow-y-auto space-y-4 font-serif">
              {activeAdminTab === 'logs' ? (
                logs.map(l => (
                  <div key={l.id} className="p-4 border-b border-atlas-ink/5 flex items-start gap-4 transition-all hover:bg-atlas-stone">
                    <div className="w-8 h-8 flex items-center justify-center border border-atlas-ink/20 opacity-30">
                      {l.action === 'login' && <UserIcon className="w-3.5 h-3.5" />}
                      {l.action === 'chat_message' && <MessageSquare className="w-3.5 h-3.5" />}
                      {l.action === 'admin_broadcast' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {l.action === 'sighting_add' && <Sprout className="w-3.5 h-3.5" />}
                      {!['login', 'chat_message', 'admin_broadcast', 'sighting_add'].includes(l.action) && <Navigation className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-1">
                        <p className="text-sm italic font-bold text-atlas-ink">{l.userName}</p>
                        <span className="text-[9px] font-mono opacity-30 uppercase">{format(parseDate(l.created || l.createdAt), 'HH:mm:ss dd.MM')}</span>
                      </div>
                      <p className="text-[8px] font-sans font-black uppercase tracking-widest text-atlas-earth mb-1">{l.action}</p>
                      <p className="text-sm text-atlas-ink/70 leading-relaxed italic">{l.details}</p>
                    </div>
                  </div>
                ))
              ) : (
                reports.map(r => (
                  <div key={r.id} className="atlas-card !p-8 border-l-4 border-l-red-600 flex flex-col gap-6">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        <span className="text-[10px] font-sans font-black uppercase tracking-[0.3em] text-red-600">Alerta de {r.type}</span>
                      </div>
                      <span className="text-[9px] font-mono opacity-40">{format(parseDate(r.created || r.createdAt), 'HH:mm')}</span>
                    </div>
                    <div className="border-l-2 border-red-100 pl-6 text-sm italic font-serif text-red-900 leading-relaxed">"{r.content}"</div>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-sans font-black uppercase tracking-widest opacity-40 leading-loose">
                        Informante: {r.reporterName}<br/>
                        Causa: {r.reason}
                      </div>
                      <div className="flex gap-4">
                        <button className="text-[10px] font-sans font-black uppercase tracking-widest text-red-600 underline">Extirpar</button>
                        <button className="text-[10px] font-sans font-black uppercase tracking-widest opacity-30 hover:opacity-100 transition-opacity">Archivar</button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
