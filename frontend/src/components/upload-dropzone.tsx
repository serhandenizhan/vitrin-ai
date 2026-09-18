"use client";

/**
 * Fotograf secme alani: surukle-birak ya da tiklayarak dosya secme.
 */

import { useCallback, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";

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
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-[1.5rem] border border-dashed px-6 py-16 text-center transition-[transform,border-color,background-color,box-shadow] duration-300",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_10%,rgba(214,167,86,0.12),transparent_48%)] before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        isDraggingOver
          ? "border-[#d6a756] bg-[#d6a756]/8 shadow-[0_18px_44px_-26px_rgba(214,167,86,0.75)]"
          : "border-black/12 bg-white/45 hover:-translate-y-0.5 hover:border-[#d6a756]/65 hover:bg-white/72 hover:shadow-[0_20px_46px_-30px_rgba(82,61,29,0.5)]",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span className="relative flex size-14 items-center justify-center rounded-full bg-[linear-gradient(145deg,#f6ddb0,#d6a756)] text-[#342719] shadow-[0_12px_26px_-12px_rgba(214,167,86,0.9),inset_0_1px_0_rgba(255,255,255,0.7)] transition-transform duration-300 group-hover:scale-105">
        <ImagePlus className="size-5" strokeWidth={1.5} aria-hidden />
      </span>

      <span className="relative flex flex-col gap-1">
        <span className="text-base font-medium">
          Ürün fotoğrafını buraya bırakın
        </span>
        <span className="text-muted-foreground text-sm">
          ya da seçmek için tıklayın
        </span>
      </span>

      <span className="text-muted-foreground relative rounded-full bg-black/[0.035] px-3 py-1.5 text-xs ring-1 ring-black/5">
        JPEG, PNG, WebP veya HEIC, en fazla {MAX_FILE_SIZE_MB} MB
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="hidden"
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
