"use client";

//! /marketplace/[slug]/edit — 3-step media editor for listing sellers
//! Step 1: Demo video URL
//! Step 2: Proof-of-work images (URL-based)
//! Step 3: Requirements + Deliverables

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, CheckCircle, Loader2, Play, Image as ImageIcon,
  Trash2, Plus, Lock, Package, Bot, X, Upload,
} from "lucide-react";
import {
  fetchListingBySlug, fetchListingMedia, addListingMedia, deleteListingMedia,
  type AgentListing, type ListingMedia,
} from "@/lib/api";

// ── Step 1: Video URL ─────────────────────────────────────────────────────────

// Returns an iframe-safe embed URL for YouTube, Vimeo, and Loom.
// Returns null for anything else — those are shown as a clickable link only,
// never loaded in an iframe (prevents Mux/third-party player errors).
function toEmbedUrl(raw: string): string | null {
  try { new URL(raw); } catch { return null; }
  const url = raw.trim();
  // YouTube: watch page or short link
  if (url.includes("youtube.com/watch")) {
    const v = new URL(url).searchParams.get("v");
    return v ? `https://www.youtube.com/embed/${v}` : null;
  }
  if (url.includes("youtu.be/")) {
    const id = url.split("youtu.be/")[1]?.split("?")[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  // Vimeo: vimeo.com/{id}
  if (url.includes("vimeo.com/")) {
    const id = url.split("vimeo.com/")[1]?.split("?")[0]?.split("/")[0];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  // Loom: loom.com/share/{id} → loom.com/embed/{id}
  if (url.includes("loom.com/share/")) {
    const id = url.split("loom.com/share/")[1]?.split("?")[0];
    return id ? `https://www.loom.com/embed/${id}` : null;
  }
  return null;
}

function Step1Video({
  listingId, existingVideo, onNext,
}: {
  listingId: string;
  existingVideo: ListingMedia | undefined;
  onNext: () => void;
}) {
  const [url,   setUrl]   = useState(existingVideo?.content ?? "");
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(!!existingVideo);

  function isValidUrl(s: string): boolean {
    try { new URL(s); return true; } catch { return false; }
  }

  async function handleSave() {
    const trimmed = url.trim();
    if (!trimmed) { onNext(); return; }
    if (!isValidUrl(trimmed)) { setError("Enter a valid URL (YouTube, Vimeo, or Loom)"); return; }
    setError(null);
    setBusy(true);
    try {
      await addListingMedia(listingId, { media_type: "video_url", content: trimmed, sort_order: 0 });
      setSaved(true);
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save video URL");
    } finally {
      setBusy(false);
    }
  }

  const trimmed   = url.trim();
  const embedSrc  = trimmed && isValidUrl(trimmed) ? toEmbedUrl(trimmed) : null;
  const hasUrl    = !!trimmed && isValidUrl(trimmed);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Step 1 of 3</p>
        <h2 className="text-lg font-semibold text-zinc-100">Add a demo video</h2>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          A short walkthrough dramatically improves conversion.
          Paste a <span className="text-zinc-300">YouTube</span>,{" "}
          <span className="text-zinc-300">Vimeo</span>, or{" "}
          <span className="text-zinc-300">Loom</span> share URL.
        </p>
      </div>

      {error && (
        <p className="font-mono text-xs text-red-400 border border-red-900/50 bg-red-950/20 rounded-sm p-2">{error}</p>
      )}

      <div className="space-y-2">
        <label className="block font-mono text-xs text-zinc-400">Video URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setSaved(false); setError(null); }}
          placeholder="https://www.youtube.com/watch?v=… or loom.com/share/…"
          className="w-full h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/50 transition-colors"
        />
        <p className="font-mono text-[10px] text-zinc-600">
          Supported: YouTube · Vimeo · Loom — other URLs will appear as a link only
        </p>
      </div>

      {/* Preview — only embed for known platforms; unknown URLs show a safe placeholder */}
      {hasUrl && (
        <div className="aspect-video rounded-sm border border-zinc-800 bg-zinc-900 overflow-hidden">
          {embedSrc ? (
            <iframe
              src={embedSrc}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-zinc-500">
              <Play className="w-8 h-8" />
              <span className="font-mono text-xs text-center px-4">
                Preview not available for this platform —<br />
                the URL will appear as a &ldquo;Watch video&rdquo; link on your listing
              </span>
            </div>
          )}
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 font-mono text-xs text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5" /> Video URL saved
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onNext}
          className="font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Skip this step
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={busy}
          className="flex items-center gap-2 h-10 px-5 rounded-sm bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-mono text-sm font-medium transition-all"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            : <>{trimmed ? "Save & continue" : "Continue"} <ArrowRight className="w-4 h-4" /></>
          }
        </button>
      </div>
    </div>
  );
}

// ── Step 2: Proof-of-work images ──────────────────────────────────────────────

const MAX_IMAGES = 3;

function Step2Images({
  listingId, existingImages, onNext, onBack,
}: {
  listingId:      string;
  existingImages: ListingMedia[];
  onNext:         () => void;
  onBack:         () => void;
}) {
  const [images,      setImages]      = useState<ListingMedia[]>(existingImages);
  const [newUrl,      setNewUrl]      = useState("");
  const [adding,      setAdding]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [dragOver,    setDragOver]    = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = images.length < MAX_IMAGES;

  function isValidUrl(s: string): boolean {
    try { new URL(s); return true; } catch { return false; }
  }

  // Upload one file, returns the new ListingMedia item or throws.
  async function uploadFile(file: File, sortOrder: number): Promise<ListingMedia> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/listing-images/upload", { method: "POST", body: form });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Upload failed (${res.status})`);
    }
    const { url } = await res.json() as { url: string };
    const saved = await addListingMedia(listingId, { media_type: "image", content: url, sort_order: sortOrder });
    return {
      id:         saved.media_id ?? crypto.randomUUID(),
      listing_id: listingId,
      media_type: "image",
      content:    url,
      required:   false,
      sort_order: sortOrder,
      created_at: new Date().toISOString(),
    };
  }

  // Handles 1–3 files from picker or drag-and-drop.
  async function handleFiles(files: File[]) {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    const slots = MAX_IMAGES - images.length;
    if (slots <= 0) {
      setError(`Maximum ${MAX_IMAGES} images reached. Delete one to add more.`);
      return;
    }
    const toUpload = imageFiles.slice(0, slots);
    setError(null);
    setUploading(true);
    const added: ListingMedia[] = [];
    for (const file of toUpload) {
      try {
        const item = await uploadFile(file, images.length + added.length);
        added.push(item);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        break;
      }
    }
    if (added.length) setImages((prev) => [...prev, ...added]);
    setUploading(false);
  }

  async function handleAdd() {
    if (!canAddMore) { setError(`Maximum ${MAX_IMAGES} images reached. Delete one to add more.`); return; }
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    if (!isValidUrl(trimmed)) { setError("Enter a valid image URL"); return; }
    setError(null);
    setAdding(true);
    try {
      const res = await addListingMedia(listingId, { media_type: "image", content: trimmed, sort_order: images.length });
      setImages((prev) => [...prev, {
        id: res.media_id ?? crypto.randomUUID(), listing_id: listingId,
        media_type: "image", content: trimmed, required: false,
        sort_order: images.length, created_at: new Date().toISOString(),
      }]);
      setNewUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add image");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(mediaId: string) {
    setDeleting(mediaId);
    try {
      await deleteListingMedia(listingId, mediaId);
      setImages((prev) => prev.filter((i) => i.id !== mediaId));
    } catch { /* soft fail */ } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Step 2 of 3</p>
        <h2 className="text-lg font-semibold text-zinc-100">Proof-of-work images</h2>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          Upload up to 3 screenshots or sample outputs. Auto-resized to 1280 px —
          no external hosting needed.
        </p>
      </div>

      {error && (
        <p className="font-mono text-xs text-red-400 border border-red-900/50 bg-red-950/20 rounded-sm p-2">{error}</p>
      )}

      {/* Drag-and-drop / click-to-browse zone */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            (e.target as HTMLInputElement).value = "";
            handleFiles(files);
          }}
        />
        <div
          onClick={() => canAddMore && !uploading && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (canAddMore) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-sm border-2 border-dashed p-8 flex flex-col items-center gap-3 transition-all
            ${uploading
              ? "border-zinc-700 bg-zinc-900/30 cursor-wait"
              : dragOver
                ? "border-amber-400/70 bg-amber-400/5 cursor-copy"
                : canAddMore
                  ? "border-zinc-700 bg-zinc-900/30 hover:border-amber-400/40 hover:bg-zinc-900/50 cursor-pointer"
                  : "border-zinc-800 bg-zinc-900/20 opacity-50 cursor-not-allowed"
            }`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="font-mono text-xs text-zinc-300">Uploading &amp; resizing…</p>
            </>
          ) : dragOver ? (
            <>
              <Upload className="w-8 h-8 text-amber-400" />
              <p className="font-mono text-xs text-amber-300">Drop to upload</p>
            </>
          ) : (
            <>
              <Upload className="w-8 h-8 text-zinc-600" />
              <div className="text-center space-y-1">
                <p className="font-mono text-xs text-zinc-300">
                  {canAddMore ? "Drag & drop or click to browse" : `${MAX_IMAGES}/${MAX_IMAGES} — delete an image to add more`}
                </p>
                <p className="font-mono text-[10px] text-zinc-600">
                  Select up to {MAX_IMAGES - images.length || MAX_IMAGES} image{MAX_IMAGES - images.length !== 1 ? "s" : ""} &nbsp;·&nbsp;
                  JPEG · PNG · WebP &nbsp;·&nbsp; max 10 MB each &nbsp;·&nbsp; resized to 1280 px
                </p>
              </div>
            </>
          )}
          <span className={`font-mono text-[10px] px-2 py-0.5 rounded-sm border
            ${images.length >= MAX_IMAGES
              ? "border-zinc-700 text-zinc-500 bg-zinc-800/50"
              : "border-amber-900/40 text-amber-600 bg-amber-950/20"}`}>
            {images.length} / {MAX_IMAGES} images
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-zinc-800" />
        <span className="font-mono text-[10px] text-zinc-600">or paste a URL</span>
        <div className="flex-1 h-px bg-zinc-800" />
      </div>

      {/* Add by URL */}
      <div className="flex gap-2">
        <input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          placeholder="https://example.com/screenshot.png"
          disabled={!canAddMore}
          className="flex-1 h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/50 disabled:opacity-40 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newUrl.trim() || !canAddMore}
          className="flex items-center gap-1.5 h-10 px-4 rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono text-xs hover:border-zinc-600 hover:text-zinc-100 disabled:opacity-40 transition-all"
        >
          {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Add</>}
        </button>
      </div>

      {/* Image grid */}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((img) => (
            <div key={img.id} className="relative group aspect-video">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.content}
                alt="Proof of work"
                className="w-full h-full object-cover rounded-sm border border-zinc-800 cursor-pointer"
                onClick={() => setLightboxUrl(img.content)}
                onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.opacity = "0.3"; }}
              />
              {/* Delete button */}
              <button
                onClick={() => handleDelete(img.id)}
                disabled={deleting === img.id}
                className="absolute top-1 right-1 w-6 h-6 rounded-sm bg-zinc-900/90 border border-zinc-700 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:border-red-700 hover:text-red-400 text-zinc-400 transition-all"
                aria-label="Delete image"
              >
                {deleting === img.id
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Trash2 className="w-3 h-3" />
                }
              </button>
              {/* Expand hint */}
              <div className="absolute bottom-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="font-mono text-[9px] text-zinc-300 bg-zinc-900/80 px-1 rounded">click to preview</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-sm border border-dashed border-zinc-800 p-8 flex flex-col items-center gap-2 text-zinc-700">
          <ImageIcon className="w-8 h-8" />
          <p className="font-mono text-xs">No images added yet</p>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-sm bg-zinc-900/80 border border-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt="Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-sm"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button onClick={onBack} className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex-1" />
        <button
          onClick={onNext}
          className="flex items-center gap-2 h-10 px-5 rounded-sm bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm font-medium transition-all"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Requirements + Deliverables ────────────────────────────────────────

function Step3RequirementsDeliverables({
  listingId, existingReqs, existingDelivs, onBack, onDone,
}: {
  listingId:       string;
  existingReqs:    ListingMedia[];
  existingDelivs:  ListingMedia[];
  onBack:          () => void;
  onDone:          () => void;
}) {
  const [reqs,      setReqs]      = useState<ListingMedia[]>(existingReqs);
  const [delivs,    setDelivs]    = useState<ListingMedia[]>(existingDelivs);
  const [newReq,    setNewReq]    = useState("");
  const [reqReq,    setReqReq]    = useState(true); // required toggle
  const [newDeliv,  setNewDeliv]  = useState("");
  const [addingReq, setAddingReq] = useState(false);
  const [addingDel, setAddingDel] = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);

  async function handleAddReq() {
    const text = newReq.trim();
    if (!text) return;
    setError(null);
    setAddingReq(true);
    try {
      const res = await addListingMedia(listingId, {
        media_type: "requirement",
        content:    text,
        required:   reqReq,
        sort_order: reqs.length,
      });
      const item: ListingMedia = {
        id:         res.media_id ?? crypto.randomUUID(),
        listing_id: listingId,
        media_type: "requirement",
        content:    text,
        required:   reqReq,
        sort_order: reqs.length,
        created_at: new Date().toISOString(),
      };
      setReqs((prev) => [...prev, item]);
      setNewReq("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add requirement");
    } finally {
      setAddingReq(false);
    }
  }

  async function handleAddDeliv() {
    const text = newDeliv.trim();
    if (!text) return;
    setError(null);
    setAddingDel(true);
    try {
      const res = await addListingMedia(listingId, {
        media_type: "deliverable",
        content:    text,
        sort_order: delivs.length,
      });
      const item: ListingMedia = {
        id:         res.media_id ?? crypto.randomUUID(),
        listing_id: listingId,
        media_type: "deliverable",
        content:    text,
        required:   true,
        sort_order: delivs.length,
        created_at: new Date().toISOString(),
      };
      setDelivs((prev) => [...prev, item]);
      setNewDeliv("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add deliverable");
    } finally {
      setAddingDel(false);
    }
  }

  async function handleDelete(mediaId: string, type: "req" | "deliv") {
    setDeleting(mediaId);
    try {
      await deleteListingMedia(listingId, mediaId);
      if (type === "req")   setReqs((prev)   => prev.filter((r) => r.id !== mediaId));
      else                  setDelivs((prev) => prev.filter((d) => d.id !== mediaId));
    } catch { /* soft fail */ }
    finally { setDeleting(null); }
  }

  function handleDone() {
    setSaving(true);
    onDone();
  }

  return (
    <div className="space-y-7">
      <div>
        <p className="font-mono text-[10px] text-amber-500 uppercase tracking-widest mb-1">Step 3 of 3</p>
        <h2 className="text-lg font-semibold text-zinc-100">Requirements & deliverables</h2>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          Tell buyers exactly what you need from them and what they&apos;ll get back.
          Clear expectations reduce disputes.
        </p>
      </div>

      {error && (
        <p className="font-mono text-xs text-red-400 border border-red-900/50 bg-red-950/20 rounded-sm p-2">{error}</p>
      )}

      {/* Requirements */}
      <div className="space-y-3">
        <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">Requirements from buyer</p>

        {/* existing */}
        {reqs.map((r) => (
          <div key={r.id} className={`flex items-center gap-2 p-2 rounded-sm border ${r.required ? "border-amber-900/50 bg-amber-950/10" : "border-zinc-800"}`}>
            <span className={`font-mono text-[10px] px-1 rounded-sm flex-shrink-0 ${r.required ? "text-amber-400 bg-amber-400/10" : "text-zinc-600 bg-zinc-800"}`}>
              {r.required ? "required" : "optional"}
            </span>
            <span className="font-mono text-xs text-zinc-300 flex-1">{r.content}</span>
            <button onClick={() => handleDelete(r.id, "req")} disabled={deleting === r.id}
              className="text-zinc-600 hover:text-red-400 transition-colors">
              {deleting === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}

        {/* add new */}
        <div className="flex gap-2">
          <button
            onClick={() => setReqReq((v) => !v)}
            className={`h-10 px-3 rounded-sm border font-mono text-xs flex-shrink-0 transition-all
              ${reqReq ? "border-amber-400/40 bg-amber-400/10 text-amber-400" : "border-zinc-700 bg-zinc-900 text-zinc-500"}`}
          >
            {reqReq ? "Required" : "Optional"}
          </button>
          <input
            type="text"
            value={newReq}
            onChange={(e) => setNewReq(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddReq(); } }}
            placeholder="e.g. Admin API key with read/write scope"
            className="flex-1 h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/50 transition-colors"
          />
          <button onClick={handleAddReq} disabled={addingReq || !newReq.trim()}
            className="flex items-center gap-1 h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono text-xs hover:border-zinc-600 disabled:opacity-40 transition-all">
            {addingReq ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Deliverables */}
      <div className="space-y-3">
        <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-widest">What you deliver</p>

        {/* existing */}
        {delivs.map((d) => (
          <div key={d.id} className="flex items-center gap-2 p-2 rounded-sm border border-zinc-800">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span className="font-mono text-xs text-zinc-300 flex-1">{d.content}</span>
            <button onClick={() => handleDelete(d.id, "deliv")} disabled={deleting === d.id}
              className="text-zinc-600 hover:text-red-400 transition-colors">
              {deleting === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        ))}

        {/* add new */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newDeliv}
            onChange={(e) => setNewDeliv(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddDeliv(); } }}
            placeholder="e.g. Working deployed agent with runbook"
            className="flex-1 h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-100 text-xs font-mono placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/50 transition-colors"
          />
          <button onClick={handleAddDeliv} disabled={addingDel || !newDeliv.trim()}
            className="flex items-center gap-1 h-10 px-3 rounded-sm border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono text-xs hover:border-zinc-600 disabled:opacity-40 transition-all">
            {addingDel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button onClick={onBack} className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDone}
          disabled={saving}
          className="flex items-center gap-2 h-10 px-5 rounded-sm bg-amber-400 hover:bg-amber-300 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-950 font-mono text-sm font-medium transition-all"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle className="w-4 h-4" /> Finish</>}
        </button>
      </div>
    </div>
  );
}

// ── Main edit page ─────────────────────────────────────────────────────────────
// useSearchParams() requires a <Suspense> boundary in Next.js 15 — hard nav
// (window.location.href) triggers a server render where the hook throws without it.

function EditListingInner() {
  const params        = useParams();
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const slug       = typeof params.slug === "string" ? params.slug : "";
  const fromCreate = searchParams.get("from") === "create";

  const profileId = (session?.user as { profileId?: string })?.profileId ?? "";

  const [listing, setListing] = useState<AgentListing | null>(null);
  const [media,   setMedia]   = useState<ListingMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [step,    setStep]    = useState(1);
  const [done,    setDone]    = useState(false);

  useEffect(() => {
    if (!slug) return;
    // Wait until NextAuth confirms the session state — avoids false owner-check
    // failures caused by profileId being "" during initial hydration after a
    // hard navigation (window.location.href from post-job).
    if (sessionStatus === "loading") return;

    (async () => {
      try {
        const l = await fetchListingBySlug(slug);
        // When arriving from listing creation the user is guaranteed to be the
        // owner — skip the redirect to avoid a race where developer_id in the
        // listing hasn't been indexed yet or the session token lagged.
        if (!fromCreate && l.developer_id !== profileId && profileId !== "") {
          router.replace(`/marketplace/${slug}`);
          return;
        }
        setListing(l);
        try {
          const m = await fetchListingMedia(l.id);
          setMedia(m.media ?? []);
        } catch { /* no media yet */ }
      } catch {
        setError("Listing not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, profileId, router, sessionStatus, fromCreate]);

  // ── Loading / error ────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
    </div>
  );

  if (error || !listing) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <Package className="w-10 h-10 text-zinc-700" />
      <p className="font-mono text-sm text-zinc-400">{error ?? "Listing not found"}</p>
      <Link href="/marketplace" className="font-mono text-xs text-amber-400 hover:underline">
        Back to marketplace
      </Link>
    </div>
  );

  // ── Done ───────────────────────────────────────────────────────────────────

  if (done) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5 text-center">
        <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto" />
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Listing updated</h2>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            Your demo video, images, requirements, and deliverables are now live.
          </p>
        </div>
        <div className="space-y-2">
          <Link href={`/marketplace/${listing.slug}`}
            className="block w-full h-11 flex items-center justify-center gap-2 rounded-sm bg-amber-400 hover:bg-amber-300 text-zinc-950 font-mono text-sm font-medium transition-all">
            View listing
          </Link>
          <Link href="/marketplace"
            className="block w-full h-11 flex items-center justify-center gap-2 rounded-sm border border-zinc-700 hover:border-zinc-600 text-zinc-400 font-mono text-sm transition-all">
            Browse marketplace
          </Link>
        </div>
      </div>
    </div>
  );

  // ── Wizard ────────────────────────────────────────────────────────────────

  const existingVideo  = media.find((m) => m.media_type === "video_url");
  const existingImages = media.filter((m) => m.media_type === "image");
  const existingReqs   = media.filter((m) => m.media_type === "requirement");
  const existingDelivs = media.filter((m) => m.media_type === "deliverable");

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/marketplace/${listing.slug}`}
            className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to listing
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-sm bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-zinc-950" />
            </div>
            <span className="font-mono text-sm text-zinc-300">
              AiStaff<span className="text-amber-400">App</span>
            </span>
          </div>
        </div>

        {/* Welcome banner — shown only when arriving from /post-job */}
        {fromCreate && (
          <div className="flex items-start gap-2.5 p-3 rounded-sm border border-emerald-800/50 bg-emerald-950/20">
            <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-mono text-xs text-emerald-300 font-medium">Listing is live!</p>
              <p className="font-mono text-[11px] text-emerald-700 mt-0.5">
                Now add a demo video, screenshots, and requirements — listings with media convert 3× better.
              </p>
            </div>
          </div>
        )}

        {/* Listing name */}
        <div className="p-3 rounded-sm border border-zinc-800 bg-zinc-900/40">
          <p className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">
            {fromCreate ? "Your new listing" : "Editing"}
          </p>
          <p className="font-mono text-sm text-zinc-200 truncate">{listing.name}</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-sm flex items-center justify-center font-mono text-xs flex-shrink-0 transition-all
                ${step > s ? "bg-emerald-600 text-zinc-950" : step === s ? "bg-amber-400 text-zinc-950" : "bg-zinc-800 text-zinc-500"}`}>
                {step > s ? <CheckCircle className="w-3.5 h-3.5" /> : s}
              </div>
              {s < 3 && <div className={`flex-1 h-px ${step > s ? "bg-emerald-800" : "bg-zinc-800"}`} />}
            </div>
          ))}
        </div>

        {/* ── Step content ──────────────────────────────────────────────── */}
        <div className="border border-zinc-800 rounded-sm p-5 bg-zinc-900/20">
          {step === 1 && (
            <Step1Video
              listingId={listing.id}
              existingVideo={existingVideo}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2Images
              listingId={listing.id}
              existingImages={existingImages}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step3RequirementsDeliverables
              listingId={listing.id}
              existingReqs={existingReqs}
              existingDelivs={existingDelivs}
              onBack={() => setStep(2)}
              onDone={() => setDone(true)}
            />
          )}
        </div>

        {/* Security note */}
        <div className="flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0 mt-0.5" />
          <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">
            Changes are live immediately. Buyers viewing your listing will see updated media within seconds.
          </p>
        </div>

      </div>
    </div>
  );
}

// Suspense boundary required by Next.js 15 — useSearchParams() inside
// EditListingInner throws during server render without this wrapper.
export default function EditListingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-zinc-600 animate-spin" />
      </div>
    }>
      <EditListingInner />
    </Suspense>
  );
}
