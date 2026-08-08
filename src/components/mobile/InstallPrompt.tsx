import { useEffect, useState, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useDevice';

/**
 * Smart install prompt — shows once after meaningful engagement.
 * Not invasive: appears as a subtle card, dismisses for 7 days.
 */
export default function InstallPrompt() {
  const { isInstallable, isInstalled, prompt, dismiss, wasRecentlyDismissed } = useInstallPrompt();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isInstallable || isInstalled) return;

    // Show after a short delay to not compete with initial load
    const showTimer = setTimeout(() => {
      if (!wasRecentlyDismissed()) {
        setVisible(true);
      }
    }, 8000); // 8s after mount

    return () => clearTimeout(showTimer);
  }, [isInstallable, isInstalled, wasRecentlyDismissed]);

  const handleInstall = useCallback(async () => {
    const accepted = await prompt();
    if (accepted) setVisible(false);
  }, [prompt]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    dismiss();
  }, [dismiss]);

  if (!visible || isInstalled) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[998] lg:hidden animate-in slide-in-from-bottom">
      <div className="bg-atlas-ink text-atlas-paper p-4 border border-atlas-ink flex items-start gap-3 shadow-atlas">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded bg-atlas-paper/10 flex items-center justify-center">
          <Download className="w-5 h-5 text-atlas-paper" />
        </div>

        {/* Copy */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-serif italic leading-snug">
            Instalar Biocorredor MR en tu dispositivo
          </p>
          <p className="text-[10px] font-sans text-atlas-paper/60 mt-1 uppercase tracking-wider">
            Acceso rápido · Funciona offline
          </p>
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="text-[9px] font-sans font-black uppercase tracking-widest
              bg-atlas-paper text-atlas-ink px-3 py-1.5 hover:bg-atlas-stone transition-colors"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            className="text-atlas-paper/40 hover:text-atlas-paper transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
