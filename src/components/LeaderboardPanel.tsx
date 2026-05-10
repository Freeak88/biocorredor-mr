import React, { useState, useEffect } from 'react';
import { Trophy, X } from 'lucide-react';
import { pb } from '../lib/pb';

interface LeaderboardEntry {
  rank: number;
  user: { id: string; name: string; avatar: string };
  score: number;
  badges_count: number;
}

export default function LeaderboardPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        pb.send(`/api/custom/leaderboard?lat=${lat}&lng=${lng}&radius=30`, { method: 'GET' })
          .then((data: any) => {
            setEntries(data.entries || []);
          })
          .catch(() => setEntries([]))
          .finally(() => setLoading(false));
      },
      () => {
        // Fallback: leaderboard sin geo
        pb.send('/api/custom/leaderboard?lat=0&lng=0&radius=30', { method: 'GET' })
          .then((data: any) => {
            setEntries(data.entries || []);
          })
          .catch(() => setEntries([]))
          .finally(() => setLoading(false));
      }
    );
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 transition-all text-atlas-ink opacity-40 hover:opacity-100"
        title="Leaderboard"
      >
        <Trophy className="w-5 h-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[3000] bg-atlas-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="bg-atlas-paper w-full max-w-md max-h-[80vh] overflow-y-auto shadow-atlas border-2 border-atlas-ink m-4">
            <div className="bg-atlas-ink p-4 flex items-center justify-between text-atlas-paper">
              <h3 className="text-lg italic font-serif">Top Descubridores</h3>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-atlas-paper/20 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {loading && (
                <p className="text-center text-[10px] font-sans font-black uppercase tracking-widest opacity-40">
                  Cargando...
                </p>
              )}

              {!loading && entries.length === 0 && (
                <p className="text-center text-[10px] font-sans font-black uppercase tracking-widest opacity-40">
                  Aún no hay descubridores en tu zona. ¡Sé el primero!
                </p>
              )}

              {entries.map((entry) => (
                <div
                  key={entry.rank}
                  className="flex items-center gap-3 p-3 border border-atlas-ink/10 hover:bg-atlas-stone/10 transition-colors"
                >
                  <div className={`w-8 h-8 flex items-center justify-center font-sans font-black text-sm ${
                    entry.rank === 1 ? 'bg-yellow-500 text-white' :
                    entry.rank === 2 ? 'bg-gray-400 text-white' :
                    entry.rank === 3 ? 'bg-amber-700 text-white' :
                    'bg-atlas-stone text-atlas-ink'
                  }`}>
                    {entry.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-serif italic text-sm truncate">{entry.user.name}</p>
                    <p className="text-[9px] font-sans font-black uppercase tracking-wider opacity-50">
                      {entry.score} primeras zonales • {entry.badges_count} insignias
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
