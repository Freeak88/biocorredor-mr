import { AnimatePresence, motion } from 'motion/react';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useDevice';

/**
 * Subtle offline banner — shows at top when connection is lost.
 * Auto-hides when back online.
 */
export default function OfflineIndicator() {
  const online = useOnline();

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 left-0 right-0 z-[1100] flex items-center justify-center gap-2
            bg-atlas-ink/90 text-atlas-paper backdrop-blur-sm
            py-1.5 px-4"
        >
          <WifiOff className="w-3.5 h-3.5 text-atlas-earth" />
          <span className="text-[10px] font-sans font-black uppercase tracking-[0.15em]">
            Sin conexión · Datos cacheados
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
