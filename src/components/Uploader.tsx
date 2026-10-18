import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Expand,
  ImagePlus,
  LoaderCircle,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { fileToUploadImage, pdfToUploadImages, rotateImage } from '../lib';
import type { UploadImage } from '../types';

interface UploaderProps {
  images: UploadImage[];
  onChange: (images: UploadImage[]) => void;
  max: number;
  emptyTitle: string;
  emptyHint: string;
  pageLabel?: boolean;
  onError?: (message: string) => void;
  onNotice?: (message: string) => void;
  compact?: boolean;
}

export default function Uploader({
  images,
  onChange,
  max,
  emptyTitle,
  emptyHint,
  pageLabel = true,
  onError,
  onNotice,
  compact = false,
}: UploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const addFilesRef = useRef<(files: FileList | File[], fromPaste?: boolean) => Promise<void>>(async () => {});
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<UploadImage | null>(null);
  const [pasteReady, setPasteReady] = useState(false);

  addFilesRef.current = addFiles;
  busyRef.current = busy;

  useEffect(() => {
    if (!pasteReady) return;
    function handlePaste(event: ClipboardEvent) {
      if (busyRef.current) return;
      const items = Array.from(event.clipboardData?.items || []);
      let files = items
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!files.length) {
        files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/'));
      }
      if (!files.length) return;
      event.preventDefault();
      void addFilesRef.current(files, true);
    }
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [pasteReady]);

  async function addFiles(fileList: FileList | File[], fromPaste = false) {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
    if (!files.length) {
      onError?.('请选择 JPG、PNG 或 PDF 文件');
      return;
    }
    const room = max - images.length;
    if (room <= 0) {
      onError?.(`最多上传 ${max} 张图片 / PDF 页`);
      return;
    }
    setBusy(true);
    busyRef.current = true;
    const added: UploadImage[] = [];
    for (const file of files) {
      if (added.length >= room) break;
      try {
        if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
          const pages = await pdfToUploadImages(file, room - added.length);
          if (!pages.length) throw new Error('PDF 中没有可识别的页面');
          added.push(...pages);
        } else {
          added.push(await fileToUploadImage(file));
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : '文件处理失败');
      }
    }
    if (added.length) {
      onChange([...images, ...added]);
      if (fromPaste) onNotice?.(`已从剪贴板粘贴 ${added.length} 页图片`);
    }
    if (files.length > added.length) onError?.(`已达到上限，仅添加前 ${added.length} 页`);
    setBusy(false);
    busyRef.current = false;
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(id: string) {
    onChange(images.filter((image) => image.id !== id));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  async function rotate(id: string) {
    const target = images.find((image) => image.id === id);
    if (!target) return;
    try {
      const rotated = await rotateImage(target);
      onChange(images.map((image) => (image.id === id ? rotated : image)));
    } catch {
      onError?.('旋转失败，请重新上传图片');
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`uploader ${compact ? 'uploader-compact' : ''} ${pasteReady ? 'is-paste-ready' : ''}`}
      tabIndex={0}
      onFocusCapture={() => setPasteReady(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPasteReady(false);
      }}
      onMouseEnter={() => setPasteReady(true)}
      onMouseLeave={() => setPasteReady(false)}
      aria-label="上传区域，支持 Ctrl/Cmd+V 粘贴图片"
    >
      <span className="paste-float" aria-hidden="true">Ctrl/Cmd+V 粘贴</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.pdf"
        multiple
        hidden
        onChange={(event) => event.target.files && addFiles(event.target.files)}
      />

      {images.length === 0 ? (
        <button
          type="button"
          className={`dropzone ${dragging ? 'is-dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
          }}
        >
          <span className="dropzone-icon">
            {busy ? <LoaderCircle className="spin" size={24} /> : <ImagePlus size={24} strokeWidth={1.6} />}
          </span>
          <strong>{busy ? '正在处理图片…' : emptyTitle}</strong>
          <span>{busy ? '自动压缩并校正方向' : emptyHint}</span>
          <span className="dropzone-tag">JPG / PNG / PDF · 单张 ≤ 25MB · 最多 {max} 页</span>
          <span className="paste-hint">或按 Ctrl/Cmd+V 粘贴剪贴板截图</span>
        </button>
      ) : (
        <>
          <div className="thumb-grid">
            {images.map((image, index) => (
              <figure className="thumb" key={image.id}>
                <button className="thumb-image" onClick={() => setPreview(image)} title="查看大图">
                  <img src={image.dataUrl} alt={image.name || `图片 ${index + 1}`} />
                  <span className="thumb-zoom"><Expand size={13} /></span>
                </button>
                {pageLabel ? <figcaption>第 {index + 1} 页</figcaption> : <figcaption>{image.name || `图片 ${index + 1}`}</figcaption>}
                <div className="thumb-tools">
                  {pageLabel && (
                    <>
                      <button disabled={index === 0} onClick={() => move(index, -1)} title="前移"><ChevronLeft size={13} /></button>
                      <button disabled={index === images.length - 1} onClick={() => move(index, 1)} title="后移"><ChevronRight size={13} /></button>
                    </>
                  )}
                  <button onClick={() => rotate(image.id)} title="顺时针旋转"><RotateCw size={13} /></button>
                  <button onClick={() => remove(image.id)} title="删除" className="danger"><Trash2 size={13} /></button>
                </div>
              </figure>
            ))}
            {images.length < max && (
              <button
                type="button"
                className={`thumb-add ${dragging ? 'is-dragging' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
                }}
              >
                {busy ? <LoaderCircle className="spin" size={20} /> : <ImagePlus size={20} strokeWidth={1.6} />}
                <span>{busy ? '处理中' : '继续添加'}</span>
                <small>{images.length} / {max}</small>
              </button>
            )}
          </div>
          <div className="uploader-foot">
            <span>拖动 / Ctrl/Cmd+V 粘贴 / 点击缩略图查看大图</span>
            <span>{images.length} / {max} 张</span>
          </div>
        </>
      )}

      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)} role="dialog" aria-label="图片预览">
          <button className="lightbox-close" onClick={() => setPreview(null)} aria-label="关闭"><X size={20} /></button>
          <img src={preview.dataUrl} alt={preview.name} onClick={(event) => event.stopPropagation()} />
          <div className="lightbox-caption">{preview.name}</div>
        </div>
      )}
    </div>
  );
}
