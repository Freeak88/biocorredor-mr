import React, { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
  onEmailLogin?: (email: string, password: string) => Promise<void>;
  onRegister?: (email: string, password: string, name: string) => Promise<void>;
}

export default function LoginScreen({ onLogin, onEmailLogin, onRegister }: LoginScreenProps) {
  const [mode, setMode] = useState<'loading' | 'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (!name.trim()) { setError('Ingresa tu nombre'); setSubmitting(false); return; }
        await onRegister?.(email, password, name);
      } else {
        await onEmailLogin?.(email, password);
      }
    } catch (err: any) {
      setError(err?.message || 'Error de autenticación');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center bg-atlas-paper relative overflow-y-auto overflow-x-hidden pb-[env(safe-area-inset-bottom)]">
      {/* Decorative background */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 border border-atlas-ink rounded-full animate-[spin_20s_linear_infinite]" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 border border-atlas-ink rounded-full animate-[spin_15s_linear_infinite_reverse]" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-8 pt-8 pb-24 flex-1 flex flex-col">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <div className="w-24 h-24 border-2 border-dashed border-atlas-ink rounded-full animate-[spin_10s_linear_infinite] flex items-center justify-center" />
            <img
              src="/isotipo-funga.svg"
              alt="Funga"
              className="w-10 h-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          </div>
          <h1 className="text-3xl font-serif italic text-atlas-ink">Funga Map</h1>
          <p className="text-atlas-ink/50 font-serif italic text-sm mt-1">Atlas Micológico Colaborativo</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-sans text-center rounded">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {mode === 'register' && (
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-ink/40" />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nombre"
                required
                className="w-full atlas-input pl-11"
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-ink/40" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full atlas-input pl-11"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-atlas-ink/40" />
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña"
              required
              minLength={8}
              className="w-full atlas-input pl-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-atlas-ink/40 hover:text-atlas-ink transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full atlas-button !py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-atlas-paper border-t-transparent rounded-full animate-spin" />
            ) : (
              mode === 'register' ? 'Crear Cuenta' : 'Ingresar'
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <p className="text-center text-[10px] font-sans uppercase tracking-widest text-atlas-ink/40 mt-3">
          {mode === 'register' ? (
            <>¿Ya tenés cuenta? <button onClick={() => { setMode('login'); setError(''); }} className="text-atlas-earth hover:underline">Ingresar</button></>
          ) : (
            <>¿No tenés cuenta? <button onClick={() => { setMode('register'); setError(''); }} className="text-atlas-earth hover:underline">Registrarse</button></>
          )}
        </p>

        {/* Divider */}
        <div className="flex items-center gap-4 my-5">
          <div className="flex-1 h-px bg-atlas-ink/10" />
          <span className="text-[9px] font-sans uppercase tracking-widest text-atlas-ink/30">o</span>
          <div className="flex-1 h-px bg-atlas-ink/10" />
        </div>

        {/* Google OAuth */}
        <button
          onClick={onLogin}
          className="w-full py-3 bg-atlas-ink text-atlas-paper border-2 border-atlas-ink shadow-atlas hover:bg-atlas-earth transition-all flex items-center justify-center gap-3 font-sans font-black text-[10px] uppercase tracking-[0.2em]"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continuar con Google
        </button>

        {/* Mission statement */}
        <div className="mt-6 px-4 text-center space-y-2 flex-shrink-0">
          <div className="w-8 h-px bg-atlas-earth/40 mx-auto" />
          <p className="font-serif italic text-[11px] text-atlas-ink/70 leading-relaxed max-w-[260px] mx-auto">
            Redescubrí lo autóctono. Cada registro fortalece una red comunitaria de conocimiento soberano sobre hongos silvestres — una base validada para conservación y modelos de aprendizaje que identifican lo conocido y lo aún por descubrir.
          </p>
          <p className="text-[9px] font-sans uppercase tracking-[0.25em] text-atlas-earth">
            Conservación · Ciencia · Territorio
          </p>
        </div>
      </div>

      {/* Bottom bar — fixed above system nav */}
      <div className="fixed bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-2 py-3 px-4 bg-gradient-to-t from-atlas-paper via-atlas-paper to-transparent" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <div className="w-16 h-px bg-atlas-earth/20" />
        <div className="flex justify-center gap-4">
          <a href="/privacidad/" className="text-[9px] font-sans uppercase tracking-widest text-atlas-ink/30 hover:text-atlas-earth transition-colors">
            Privacidad
          </a>
          <span className="text-atlas-ink/20 text-[9px]">·</span>
          <a href="/terminos/" className="text-[9px] font-sans uppercase tracking-widest text-atlas-ink/30 hover:text-atlas-earth transition-colors">
            Términos
          </a>
        </div>
      </div>
    </div>
  );
}
