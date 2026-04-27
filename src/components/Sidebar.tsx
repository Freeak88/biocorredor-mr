import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Download } from 'lucide-react';
import { Sighting } from '../types';

interface SidebarProps {
  showSidebar: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filteredSightings: Sighting[];
  onSightingClick: (s: Sighting) => void;
  isAdmin: boolean;
  onExport: () => void;
}

export default function Sidebar({
  showSidebar,
  searchQuery,
  setSearchQuery,
  filteredSightings,
  onSightingClick,
  isAdmin,
  onExport
}: SidebarProps) {
  return (
    <AnimatePresence>
      {showSidebar && (
        <motion.aside
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="absolute top-6 left-6 w-[280px] bg-atlas-paper border-2 border-atlas-ink shadow-atlas flex flex-col z-[1001]"
        >
          <div className="p-4 flex items-center gap-3 bg-atlas-paper">
            <Search className="w-4 h-4 text-atlas-ink opacity-40 shrink-0" />
            <input
              type="text"
              placeholder="Filtro rápido..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none py-1 text-xs font-sans focus:outline-none placeholder:opacity-40 flex-1"
            />
          </div>

          {searchQuery.trim().length > 0 && (
            <div className="max-h-[300px] overflow-y-auto p-4 pt-0 space-y-3 border-t border-atlas-ink/10">
              <h2 className="text-[8px] font-sans font-black uppercase tracking-widest opacity-40 mt-3 mb-2">Hallazgos</h2>
              {filteredSightings.map(s => (
                <div
                  key={s.id}
                  onClick={() => onSightingClick(s)}
                  className={`group cursor-pointer border-b border-atlas-ink/5 pb-2 last:border-0 hover:bg-atlas-stone/20 transition-all ${s.status === 'draft' ? 'opacity-60' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-sm italic font-serif leading-tight group-hover:text-atlas-earth">{s.mushroomName}</h4>
                  </div>
                  <p className="text-[8px] opacity-40 font-sans font-black uppercase tracking-widest">{s.userName}</p>
                </div>
              ))}
              {filteredSightings.length === 0 && (
                <p className="text-[10px] italic opacity-40 font-serif pb-2">Sin coincidencias.</p>
              )}
            </div>
          )}

          {isAdmin && (
            <div className="p-3 border-t border-atlas-ink/10 bg-atlas-stone/20">
              <button onClick={onExport} className="w-full text-left flex items-center gap-2 text-[9px] font-sans font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity">
                <Download className="w-3 h-3" /> Exportar a QGIS
              </button>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
