import React from 'react';

interface UserBadgesProps {
  badges: string[];
}

function parseBadge(badge: string): { icon: string; label: string; color: string } {
  if (badge.startsWith('first_global:')) {
    const species = badge.replace('first_global:', '').replace(/_/g, ' ');
    return { icon: '🥇', label: `Primero en Funga Map: ${species}`, color: '#D4A574' };
  }
  if (badge.startsWith('first_local:')) {
    const parts = badge.replace('first_local:', '').split(':');
    const radius = parts[0];
    const species = parts.slice(1).join(':').replace(/_/g, ' ');
    return { icon: '🌎', label: `Primero en la zona (${radius}): ${species}`, color: '#2D4032' };
  }
  return { icon: '🏅', label: badge, color: '#8B7355' };
}

export default function UserBadges({ badges }: UserBadgesProps) {
  if (!badges || badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((badge, idx) => {
        const parsed = parseBadge(badge);
        return (
          <div
            key={idx}
            className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-sans font-black uppercase tracking-wider"
            style={{ backgroundColor: parsed.color + '20', color: parsed.color, border: `1px solid ${parsed.color}40` }}
            title={parsed.label}
          >
            <span>{parsed.icon}</span>
            <span className="truncate max-w-[120px]">{parsed.label}</span>
          </div>
        );
      })}
    </div>
  );
}
