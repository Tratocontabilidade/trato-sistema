"use client";

import { useRef, useState } from "react";
import { Selo } from "./Selo";

interface UploadAreaProps {
  onFile: (arquivo: File) => void;
  disabled?: boolean;
}

export function UploadArea({ onFile, disabled }: UploadAreaProps) {
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function tratarArquivos(arquivos: FileList | null) {
    const arquivo = arquivos?.[0];
    if (arquivo) onFile(arquivo);
  }

  return (
    <div
      className={`upload-area${arrastando ? " upload-area--ativa" : ""}${disabled ? " upload-area--desabilitada" : ""}`}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
      }}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (!disabled) tratarArquivos(e.dataTransfer.files);
      }}
    >
      <Selo size={56} className="upload-area-selo" />
      <p className="upload-area-titulo">Arraste sua planilha .xlsx aqui</p>
      <p className="upload-area-subtitulo">ou clique para selecionar um arquivo</p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        disabled={disabled}
        className="upload-area-input"
        onChange={(e) => tratarArquivos(e.target.files)}
      />
    </div>
  );
}
