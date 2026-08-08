import React from 'react';
import { ClipboardPenLine, LayoutDashboard, Sprout, Search, Route, MoreHorizontal, BookOpen } from 'lucide-react';
import LeaderboardPanel from './LeaderboardPanel';
import SyncStatusIndicator from './SyncStatusIndicator';
import type { CanonicalSyncStatus } from '../lib/remoteSync';

interface HeaderProps {
  user: any;
  isAdmin: boolean;
  showSidebar: boolean;
  setShowSidebar: (v: boolean) => void;
  showChat: boolean;
  setShowChat: (v: boolean) => void;
  showAdminPanel: boolean;
  setShowAdminPanel: (v: boolean) => void;
  handleLogin: () => void;
  handleLogout: () => void;
  onOpenFieldSurvey: () => void;
  canFieldRecord: boolean;
  canCoordinate: boolean;
  onOpenCoordinator: () => void;
  onOpenJourney: () => void;
  onOpenRecords: () => void;
  onOpenMap: () => void;
  syncStatus: CanonicalSyncStatus;
}

export default function Header({
  user,
  isAdmin,
  showSidebar,
  setShowSidebar,
  showChat,
  setShowChat,
  showAdminPanel,
  setShowAdminPanel,
  handleLogin,
  handleLogout,
  onOpenFieldSurvey,
  canFieldRecord,
  canCoordinate,
  onOpenCoordinator,
  onOpenJourney,
  onOpenRecords,
  onOpenMap,
  syncStatus
}: HeaderProps) {
  const [showMore, setShowMore] = React.useState(false);
  const isObserver = user?.role === 'observador';
  return (
    <header className="bg-atlas-paper text-atlas-ink p-3 flex justify-between items-center border-b border-atlas-ink z-50 relative shrink-0">
      <div className="flex items-center gap-3">
        <Sprout className="w-6 h-6 text-atlas-ink" />
        <h1 className="text-xl italic font-serif tracking-tight">Biocorredor MR <span className="text-[10px] opacity-50">· campo</span></h1>
      </div>

      <div className="flex items-center gap-6">
            {user && (
              <>
                {!isObserver && <LeaderboardPanel />}
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className={`p-2 transition-all ${isObserver ? 'hidden sm:block' : ''} ${showSidebar ? 'text-atlas-earth' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
                  title="Buscar / Filtros"
                >
                  <Search className="w-5 h-5" />
                </button>
              </>
            )}
        {user ? (
          <div className="flex items-center gap-4 font-sans font-black uppercase tracking-widest text-[9px]">
            <span className="inline-block max-w-[112px] truncate border-b border-atlas-ink/20 text-[9px] sm:max-w-none">
              {user.displayName || user.email?.split('@')[0]}
            </span>
            <SyncStatusIndicator status={syncStatus} />
            <div className="flex items-center gap-4 border-l border-atlas-ink/10 pl-4">
              {canFieldRecord && <button onClick={onOpenFieldSurvey} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 text-atlas-earth hover:underline" title="Abrir relevamiento de campo">
                <ClipboardPenLine className="h-4 w-4" /> <span className="hidden sm:inline">Relevar</span>
              </button>}
              <button onClick={onOpenJourney} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 text-atlas-ink hover:underline" title="Abrir jornada de campo">
                <Route className="h-4 w-4" /> <span className="hidden sm:inline">Jornada</span>
              </button>
              {canCoordinate && !isObserver && <button onClick={onOpenCoordinator} className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 text-atlas-ink hover:underline" title="Abrir control de relevamientos">
                <LayoutDashboard className="h-4 w-4" /> <span className="hidden sm:inline">Control</span>
              </button>}
              {!isObserver && <button
                onClick={() => setShowChat(!showChat)}
                className={`transition-all ${showChat ? 'text-atlas-ink underline underline-offset-4' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
              >
                Chat
              </button>}
              {isObserver && <div className="relative">
                <button onClick={() => setShowMore((value) => !value)} className="inline-flex min-h-11 min-w-11 items-center justify-center text-atlas-ink" title="Más opciones" aria-expanded={showMore}><MoreHorizontal className="h-5 w-5" /></button>
                {showMore && <div className="absolute right-0 top-12 z-[3000] w-48 border-2 border-atlas-ink bg-atlas-paper p-2 shadow-atlas">
                  <button onClick={() => { onOpenRecords(); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[10px] font-black uppercase tracking-wider hover:bg-atlas-stone"><BookOpen className="h-4 w-4" /> Mis registros</button>
                  <button onClick={() => { onOpenMap(); setShowMore(false); }} className="flex min-h-11 w-full items-center px-3 text-left text-[10px] font-black uppercase tracking-wider hover:bg-atlas-stone">Mapa</button>
                  <button onClick={() => { setShowChat(true); setShowMore(false); }} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[10px] font-black uppercase tracking-wider hover:bg-atlas-stone">Chat</button>
                  <button onClick={handleLogout} className="flex min-h-11 w-full items-center px-3 text-left text-[10px] font-black uppercase tracking-wider hover:bg-atlas-stone">Salir</button>
                </div>}
              </div>}
              {isAdmin && !isObserver && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className={`transition-all ${showAdminPanel ? 'text-atlas-earth font-black' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
                >
                  Admin
                </button>
              )}
              {!isObserver && <button onClick={handleLogout} className="text-atlas-ink opacity-40 hover:opacity-100">
                Salir
              </button>}
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
