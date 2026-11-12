import React, { useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

/**
 * Shrinks a phone photo to a small JPEG (max 640px, ~40-120 KB) in the browser so uploads stay fast on mobile data.
 * Returns a data URL the API accepts for product photos.
 */
export async function compressImage(file: File, maxSize = 640, quality = 0.72): Promise<string> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release = () => {};
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    source = bitmap; width = bitmap.width; height = bitmap.height; release = () => bitmap.close?.();
  } else {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Could not read that photo.')); img.src = url; });
    source = img; width = img.naturalWidth; height = img.naturalHeight; release = () => URL.revokeObjectURL(url);
  }
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process that photo.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  release();
  return canvas.toDataURL('image/jpeg', quality);
}

interface Props {
  /** A data URL (new photo) or an existing /api/v1/products/:id/image URL. */
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
  size?: 'sm' | 'md';
}

/** Tap to take a photo (opens the camera on phones) or choose one from the gallery/computer. */
export const ProductImagePicker: React.FC<Props> = ({ value, onChange, label = 'Product photo', size = 'md' }) => {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const box = size === 'sm' ? 'h-16 w-16' : 'h-24 w-24';

  const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setBusy(true);
    try { onChange(await compressImage(file)); }
    catch (e: any) { setError(e.message || 'Could not use that photo.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => input.current?.click()} className={`relative flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 transition hover:border-brand-500 hover:text-brand-600`} title={value ? 'Change photo' : 'Add photo'}>
        {value ? <img src={value} alt="" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}
        {busy && <span className="absolute inset-0 flex items-center justify-center bg-white/80 text-[10px] font-bold text-slate-600">…</span>}
      </button>
      <div className="min-w-0 text-xs">
        <p className="font-bold text-slate-700">{label}</p>
        <p className="text-[11px] text-slate-500">{value ? 'Tap the photo to retake it.' : 'Shown to customers when they shop and to staff when picking.'}</p>
        {value && <button type="button" onClick={() => onChange(null)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-rose-600"><X className="h-3 w-3" />Remove</button>}
        {error && <p className="mt-1 text-[11px] font-bold text-rose-600">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
    </div>
  );
};

/** Small product picture with a fallback tile, for lists (picker screens, tables). Works for any product id. */
export const ProductThumb: React.FC<{ productId?: string; src?: string; name?: string; className?: string }> = ({ productId, src, name, className = 'h-12 w-12' }) => {
  const [failed, setFailed] = useState(false);
  const url = src || (productId ? `/api/v1/products/${productId}/image` : '');
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-xl bg-slate-100 flex items-center justify-center text-lg`}>
      {url && !failed ? <img src={url} alt={name || ''} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : <span aria-hidden>📦</span>}
    </div>
  );
};
