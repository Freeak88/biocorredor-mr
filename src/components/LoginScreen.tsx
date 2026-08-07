import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';

interface LoginScreenProps {
  onLogin: () => void;
  onEmailLogin?: (email: string, password: string) => Promise<void>;
  onRegister?: (email: string, password: string, name: string) => Promise<void>;
}

export default function LoginScreen({ onLogin, onEmailLogin, onRegister }: LoginScreenProps) {
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
      await onEmailLogin?.(email, password);
    } catch (err: any) {
      setError(err?.message || 'Error de autenticación');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
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
          <h1 className="text-3xl font-serif italic text-atlas-ink">Biocorredor MR</h1>
          <p className="text-atlas-ink/50 font-serif italic text-sm mt-1">Relevamiento comunitario</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-sans text-center rounded">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleEmailSubmit} className="space-y-3">
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
              autoComplete="current-password"
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
              'Ingresar'
            )}
          </button>
        </form>

        <p className="mt-5 text-center font-sans text-[10px] uppercase tracking-widest text-atlas-ink/45">Acceso asignado por coordinación</p>
        <a href="/field-fallback/" className="mt-4 inline-block border border-atlas-earth px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wider text-atlas-earth">Abrir modo de contingencia sin conexión</a>

        {/* Mission statement */}
        <div className="mt-6 px-4 text-center space-y-2 flex-shrink-0">
          <div className="w-8 h-px bg-atlas-earth/40 mx-auto" />
          <p className="font-serif italic text-[11px] text-atlas-ink/70 leading-relaxed max-w-[260px] mx-auto">
            Cada observación fortalece una base comunitaria para conocer y cuidar el territorio de Ministro Rivadavia.
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
    </>
  );
}
