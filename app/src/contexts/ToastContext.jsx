import { createContext, useContext, useState, useCallback } from "react";

/**
 * Toast Notification System
 *
 * Renders small pop-up notifications for success, error, warning, and info.
 * Auto-dismisses after a configurable duration.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast('Idea saved!', 'success');
 *   showToast('Could not save idea. Try again.', 'error');
 */

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => dismissToast(toast.id)}
            className={`animate-slide-up cursor-pointer rounded-lg px-4 py-3 text-sm shadow-lg transition-all ${
              toast.type === "error"
                ? "bg-red-600 text-white"
                : toast.type === "success"
                ? "bg-green-600 text-white"
                : toast.type === "warning"
                ? "bg-amber-500 text-white"
                : "bg-gray-800 text-white"
            }`}
          >
            {toast.type === "error" && "❌ "}
            {toast.type === "success" && "✅ "}
            {toast.type === "warning" && "⚠️ "}
            {toast.type === "info" && "ℹ️ "}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
