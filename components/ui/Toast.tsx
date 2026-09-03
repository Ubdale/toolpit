'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Brief confirmations for actions that otherwise happen invisibly.
 *
 * Downloading a file is the main one: the browser puts it somewhere the page
 * cannot see, and on a long tool page the only feedback is a flicker in a
 * corner of the chrome that is easy to miss. Saying "saved, and it never left
 * your device" both confirms the action and repeats the one promise the site
 * exists to make, at the exact moment it matters.
 *
 * The region is a live region, so it is announced rather than only seen.
 */

type Toast = { id: number; message: string; tone: 'default' | 'vault' };

type ToastApi = { show: (message: string, tone?: Toast['tone']) => void };

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, tone: Toast['tone'] = 'default') => {
    const id = (nextId += 1);
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <ToastRow
            key={toast.id}
            toast={toast}
            onDone={() => setToasts((current) => current.filter((entry) => entry.id !== toast.id))}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3200);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      className={`motion-safe:animate-rise rounded-xl border px-4 py-2.5 text-sm shadow-card ${
        toast.tone === 'vault'
          ? 'border-vault-line bg-vault-soft text-vault'
          : 'border-line bg-surface text-text'
      }`}
    >
      {toast.message}
    </div>
  );
}

/**
 * Returns a no-op outside a provider, so a component that happens to render
 * without one degrades to silence rather than crashing.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => {} };
}
