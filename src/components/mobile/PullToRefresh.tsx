import React, { useCallback, useRef, useState } from 'react';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void>;
  /** Threshold in px to trigger refresh. Default: 80 */
  threshold?: number;
}

export default function PullToRefresh({ children, onRefresh, threshold = 80 }: PullToRefreshProps) {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const canPull = useCallback(() => {
    const el = containerRef.current;
    if (!el) return false;
    // Only allow pull when scrolled to top
    return el.scrollTop <= 0;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!canPull()) return;
    startY.current = e.touches[0].clientY;
  }, [canPull]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return;
      if (!canPull()) {
        setPullDistance(0);
        setPulling(false);
        return;
      }

      const diff = e.touches[0].clientY - startY.current;
      if (diff > 10) {
        setPulling(true);
        // Apply resistance curve
        const resisted = Math.min(diff * 0.4, threshold * 1.5);
        setPullDistance(resisted);
      }
    },
    [canPull, refreshing, threshold],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);

    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPullDistance(0);
  }, [pulling, pullDistance, threshold, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto overscroll-y-contain"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      {(pulling || refreshing) && (
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
          style={{
            height: refreshing ? 48 : pullDistance,
            opacity: refreshing ? 1 : progress,
            transition: refreshing ? 'height 0.2s ease' : 'none',
          }}
        >
          <div className="flex items-center gap-2 text-atlas-ink/60">
            {refreshing ? (
              <div
                className="w-5 h-5 border-2 border-atlas-ink/30 border-t-atlas-ink rounded-full animate-spin"
              />
            ) : (
              <svg
                className="w-5 h-5 transition-transform"
                style={{ transform: `rotate(${progress * 180}deg)` }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            )}
            <span className="text-[10px] font-sans font-black uppercase tracking-widest">
              {refreshing ? 'Actualizando...' : progress >= 1 ? 'Soltar' : 'Tirar'}
            </span>
          </div>
        </div>
      )}

      {/* Content with pull offset */}
      <div
        style={{
          transform: pulling ? `translateY(${pullDistance}px)` : undefined,
          transition: pulling ? 'none' : 'transform 0.3s ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}
