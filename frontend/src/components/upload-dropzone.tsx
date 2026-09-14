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
        "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-16 text-center transition-colors",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        isDraggingOver
          ? "border-primary bg-accent"
          : "border-border hover:border-primary/50 hover:bg-accent/50",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
        <ImagePlus className="size-5" strokeWidth={1.5} aria-hidden />
      </span>

      <span className="flex flex-col gap-1">
        <span className="text-base font-medium">
          Ürün fotoğrafını buraya bırakın
        </span>
        <span className="text-muted-foreground text-sm">
          ya da seçmek için tıklayın
        </span>
      </span>

      <span className="text-muted-foreground text-xs">
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
