"use client";

/**
 * Fotograf secme alani: surukle-birak ya da tiklayarak dosya secme.
 */

import { useCallback, useRef, useState } from "react";

import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_SIZE_MB,
} from "@/lib/upload-constraints";
import { cn } from "@/lib/utils";

type UploadDropzoneProps = {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
};

export function UploadDropzone({
  onFileSelected,
  disabled = false,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected],
  );

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Fotoğraf yükle"
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDraggingOver(false);
        if (!disabled) handleFiles(event.dataTransfer.files);
      }}
      onPointerMove={(event) => {
        // Imleci izleyen ince isik (Apple urun kartlari gibi): CSS degiskenleri, yeniden cizim yok.
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty("--x", `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty("--y", `${event.clientY - rect.top}px`);
      }}
      className={cn(
        // Apple dili: TEK yuzey (ic cerceve yok), buyuk tipografi, bol bosluk.
        // Kartin kendisi (background-remover.tsx) cerceveyi ve golgeyi tasir.
        "group relative flex cursor-pointer flex-col items-center justify-center gap-7 overflow-hidden px-6 py-20 text-center transition-colors duration-500 sm:py-28",
        "focus-visible:ring-[#f0c779]/60 outline-none focus-visible:ring-2 focus-visible:ring-inset",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-0 before:transition-opacity before:duration-500 before:content-[''] before:[background:radial-gradient(420px_circle_at_var(--x,50%)_var(--y,40%),rgba(240,199,121,0.13),transparent_65%)] hover:before:opacity-100",
        isDraggingOver && "bg-[#d6a756]/[0.09] before:opacity-100",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span className="relative flex flex-col gap-3">
        <span className="text-[2rem] leading-[1.05] font-semibold tracking-[-0.03em] text-[#f5f2ed] sm:text-[2.75rem]">
          {isDraggingOver ? "Bırakın, gerisini biz yapalım." : "Fotoğrafınızı bırakın."}
        </span>
        <span className="text-[1.0625rem] leading-snug tracking-[-0.015em] text-[#a8a29a] sm:text-[1.1875rem]">
          Arka plan saniyeler içinde kalksın.
        </span>
      </span>

      <span className="press relative inline-flex min-h-12 items-center rounded-full bg-[#f5f2ed] px-7 text-[1rem] font-medium tracking-[-0.01em] text-[#171614] transition-colors duration-300 group-hover:bg-white">
        Fotoğraf seçin
      </span>

      <span className="relative text-[0.8125rem] tracking-[-0.005em] text-[#77716a]">
        JPEG, PNG, WebP veya HEIC · en fazla {MAX_FILE_SIZE_MB} MB
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
        // Girdinin kendi tiklamasi kapsayiciya yukselip secici acmayi TEKRAR
        // denemesin (tarayicilar ic ice tiklamayi zaten engelliyor; bu acik bir guvence).
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          handleFiles(event.target.files);
          // Ayni dosya arka arkaya secilebilsin diye input'u sifirla; aksi
          // halde ikinci secimde `change` olayi hic tetiklenmiyor.
          event.target.value = "";
        }}
      />
    </div>
  );
}
