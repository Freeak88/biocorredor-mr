import React from 'react';
import { ClipboardPenLine, LayoutDashboard, Sprout, Search, Route } from 'lucide-react';
import LeaderboardPanel from './LeaderboardPanel';

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
  canCoordinate: boolean;
  onOpenCoordinator: () => void;
  onOpenJourney: () => void;
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
  canCoordinate,
  onOpenCoordinator,
  onOpenJourney
}: HeaderProps) {
  return (
    <header className="bg-atlas-paper text-atlas-ink p-3 flex justify-between items-center border-b border-atlas-ink z-50 relative shrink-0">
      <div className="flex items-center gap-3">
        <Sprout className="w-6 h-6 text-atlas-ink" />
        <h1 className="text-xl italic font-serif tracking-tight">Biocorredor MR <span className="text-[10px] opacity-50">· campo</span></h1>
      </div>

      <div className="flex items-center gap-6">
            {user && (
              <>
                <LeaderboardPanel />
                <button
                  onClick={() => setShowSidebar(!showSidebar)}
                  className={`p-2 transition-all ${showSidebar ? 'text-atlas-earth' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
                  title="Buscar / Filtros"
                >
                  <Search className="w-5 h-5" />
                </button>
              </>
            )}
        {user ? (
          <div className="flex items-center gap-4 font-sans font-black uppercase tracking-widest text-[9px]">
            <span className="hidden sm:inline-block border-b border-atlas-ink/20">
              {user.displayName || user.email?.split('@')[0]}
            </span>
            <div className="flex items-center gap-4 border-l border-atlas-ink/10 pl-4">
              <button onClick={onOpenFieldSurvey} className="inline-flex items-center gap-1 text-atlas-earth hover:underline" title="Abrir relevamiento de campo">
                <ClipboardPenLine className="h-4 w-4" /> <span className="hidden sm:inline">Relevar</span>
              </button>
              <button onClick={onOpenJourney} className="inline-flex items-center gap-1 text-atlas-ink hover:underline" title="Abrir jornada de campo">
                <Route className="h-4 w-4" /> <span className="hidden sm:inline">Jornada</span>
              </button>
              {canCoordinate && <button onClick={onOpenCoordinator} className="inline-flex items-center gap-1 text-atlas-ink hover:underline" title="Abrir control de relevamientos">
                <LayoutDashboard className="h-4 w-4" /> <span className="hidden sm:inline">Control</span>
              </button>}
              <button
                onClick={() => setShowChat(!showChat)}
                className={`transition-all ${showChat ? 'text-atlas-ink underline underline-offset-4' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
              >
                Chat
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className={`transition-all ${showAdminPanel ? 'text-atlas-earth font-black' : 'text-atlas-ink opacity-40 hover:opacity-100'}`}
                >
                  Admin
                </button>
              )}
              <button onClick={handleLogout} className="text-atlas-ink opacity-40 hover:opacity-100">
                Salir
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
