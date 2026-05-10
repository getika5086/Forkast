"use client";

import { useRef, useState, useCallback } from "react";
import { compressImageClientSide } from "@/lib/utils";

const MAX_SIZE_MB = 10;
const MAX_IMAGES = 4;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/heic"];

interface Props {
  inputType: "photo" | "screenshot";
  onImagesReady: (base64Images: string[]) => void;
  disabled?: boolean;
}

export default function ImageUpload({ inputType, onImagesReady, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [compressing, setCompressing] = useState(false);

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      const fileArray = Array.from(files).slice(0, MAX_IMAGES);

      for (const file of fileArray) {
        if (!ACCEPTED.includes(file.type) && !file.name.toLowerCase().endsWith(".heic")) {
          setError("We support JPG, PNG, HEIC, and WebP.");
          return;
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          setError(`This image is too large. Please try a smaller photo (max ${MAX_SIZE_MB}MB).`);
          return;
        }
      }

      setCompressing(true);
      try {
        const base64Images = await Promise.all(
          fileArray.map((f) => compressImageClientSide(f, 1600))
        );
        const dataUrls = base64Images.map((b64) => `data:image/jpeg;base64,${b64}`);
        setPreviews(dataUrls);
        onImagesReady(base64Images);
      } catch {
        setError("Could not process image. Please try a different file.");
      } finally {
        setCompressing(false);
      }
    },
    [onImagesReady]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer.files.length > 0) processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) processFiles(e.target.files);
    },
    [processFiles]
  );

  const label =
    inputType === "photo"
      ? "Upload a photo of the menu"
      : "Upload a screenshot of the menu";

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic"
        multiple
        className="hidden"
        onChange={handleChange}
        disabled={disabled || compressing}
      />

      {previews.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          disabled={disabled || compressing}
          className={`w-full border-2 border-dashed rounded-2xl p-10 text-center transition-colors
            ${dragging ? "border-orange-400 bg-orange-50" : "border-gray-300 hover:border-orange-400 hover:bg-orange-50"}
            ${disabled || compressing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className="flex flex-col items-center gap-3">
            <span className="text-4xl">{inputType === "photo" ? "📷" : "🖼️"}</span>
            <p className="text-base font-medium text-gray-700">{label}</p>
            <p className="text-sm text-gray-500">
              {inputType === "photo"
                ? "Tap to take a photo or choose from camera roll"
                : "Drag & drop or click to upload"}
            </p>
            <p className="text-xs text-gray-400">JPG, PNG, HEIC, WebP · Max 10MB · Up to 4 images</p>
          </div>
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden aspect-[3/4] bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Menu page ${i + 1}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setPreviews([]); if (inputRef.current) inputRef.current.value = ""; }}
            className="text-sm text-gray-500 underline"
          >
            Remove and try again
          </button>
        </div>
      )}

      {compressing && (
        <p className="mt-2 text-sm text-orange-500 text-center">Optimising image...</p>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 text-center">{error}</p>
      )}
    </div>
  );
}
