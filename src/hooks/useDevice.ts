import { useState, useEffect, useCallback, useRef } from 'react';

// ——— Device detection ———

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

interface DeviceInfo {
  type: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchDevice: boolean;
  isPWA: boolean;
  screenWidth: number;
  screenHeight: number;
}

function detectDevice(): DeviceInfo {
  if (typeof window === 'undefined') {
    return { type: 'desktop', isMobile: false, isTablet: false, isDesktop: true, isTouchDevice: false, isPWA: false, screenWidth: 1024, screenHeight: 768 };
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  const ua = navigator.userAgent;

  const isPWA = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as any).standalone === true;

  const isTablet = /iPad|Android(?!.*Mobile)/i.test(ua) || (w >= 768 && w < 1024);
  const isMobile = /Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua) || w < 768;
  const isDesktop = !isMobile && !isTablet;

  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const type: DeviceType = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  return { type, isMobile, isTablet, isDesktop, isTouchDevice, isPWA, screenWidth: w, screenHeight: h };
}

export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(detectDevice);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const mqlTablet = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');

    const handler = () => setDevice(detectDevice());

    mql.addEventListener('change', handler);
    mqlTablet.addEventListener('change', handler);
    window.addEventListener('resize', handler);

    // Also re-check display-mode (PWA install state)
    const displayMode = window.matchMedia('(display-mode: standalone)');
    displayMode.addEventListener('change', handler);

    return () => {
      mql.removeEventListener('change', handler);
      mqlTablet.removeEventListener('change', handler);
      window.removeEventListener('resize', handler);
      displayMode.removeEventListener('change', handler);
    };
  }, []);

  return device;
}

// ——— Online status ———

export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return online;
}

// ——— PWA Install Prompt ———

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    // Already installed?
    if (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setIsInstallable(false);
    return outcome === 'accepted';
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    // Store dismissal timestamp so we don't re-prompt immediately
    try {
      localStorage.setItem('fungimap_install_dismissed', Date.now().toString());
    } catch {}
  }, []);

  const wasRecentlyDismissed = useCallback((): boolean => {
    if (dismissedRef.current) return true;
    try {
      const ts = localStorage.getItem('fungimap_install_dismissed');
      if (!ts) return false;
      // Don't re-prompt for 7 days after dismissal
      return Date.now() - parseInt(ts, 10) < 7 * 24 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }, []);

  return { isInstallable, isInstalled, prompt, dismiss, wasRecentlyDismissed };
}
