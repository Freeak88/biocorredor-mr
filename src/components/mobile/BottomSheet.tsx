import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'motion/react';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Snap points as viewport percentages (0-1). Default: [0.5, 0.9] */
  snapPoints?: number[];
  /** Initial snap point index */
  initialSnap?: number;
  /** Title shown in the drag handle area */
  title?: string;
}

export default function BottomSheet({
  open,
  onClose,
  children,
  snapPoints = [0.5, 0.9],
  initialSnap = 0,
  title,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [currentSnap, setCurrentSnap] = useState(initialSnap);
  const [dragging, setDragging] = useState(false);

  const getHeight = useCallback(
    (snap: number) => `${snapPoints[snap] * 100}vh`,
    [snapPoints],
  );

  useEffect(() => {
    if (open) setCurrentSnap(initialSnap);
  }, [open, initialSnap]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      setDragging(false);
      const offset = info.offset.y;
      const velocity = info.velocity.y;

      // Close: swiped down fast or far
      if (offset > 120 || velocity > 500) {
        onClose();
        return;
      }

      // Snap navigation
      if (offset < -60 || velocity < -300) {
        // Expand to next snap
        setCurrentSnap((prev) => Math.min(prev + 1, snapPoints.length - 1));
      } else if (offset > 60 && velocity > 200) {
        // Collapse to previous snap or close
        if (currentSnap === 0) {
          onClose();
        } else {
          setCurrentSnap((prev) => Math.max(prev - 1, 0));
        }
      }
    },
    [onClose, snapPoints.length, currentSnap],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-atlas-ink/40 z-[999] lg:hidden"
            style={{ backdropFilter: 'blur(2px)' }}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0, height: getHeight(currentSnap) }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.1}
            onDragStart={() => setDragging(true)}
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 left-0 right-0 z-[1000] lg:hidden
              bg-atlas-paper border-t-2 border-atlas-ink rounded-t-none
              flex flex-col overflow-hidden"
            style={{
              maxHeight: '95vh',
              boxShadow: '0 -4px 24px rgba(45,64,50,0.15)',
              ...(dragging ? { transition: 'none' } : {}),
            }}
          >
            {/* Drag handle */}
            <div className="flex-shrink-0 flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing">
              <div className="w-10 h-1 bg-atlas-ink/20 rounded-full mb-1" />
              {title && (
                <p className="text-[10px] font-sans font-black uppercase tracking-[0.2em] text-atlas-ink/50 mt-1">
                  {title}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
