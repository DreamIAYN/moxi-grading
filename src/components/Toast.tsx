import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastState {
  id: number;
  message: string;
  tone?: 'info' | 'success' | 'error';
}

export default function Toast({ toast, onClose }: { toast: ToastState | null; onClose: () => void }) {
  if (!toast) return null;
  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`toast toast-${toast.tone || 'info'}`} role="status">
      <Icon size={17} />
      <span>{toast.message}</span>
      <button onClick={onClose} aria-label="关闭提示"><X size={14} /></button>
    </div>
  );
}
