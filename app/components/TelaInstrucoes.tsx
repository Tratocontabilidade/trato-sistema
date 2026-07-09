"use client";

import { useRef, useState } from "react";
import type { AnexoColunas, AnexoEmpresa, Empresa } from "@/lib/empresas";
import { gerarId } from "@/lib/armazenamento";
import { detectarColunasAnexo, lerLinhasAnexo, parsearAnexo } from "@/lib/anexos";
import { MapeamentoColunasAnexo } from "./MapeamentoColunasAnexo";

interface TelaInstrucoesProps {
  empresa: Empresa;
  onComecar: (instrucoesTexto: string, anexoTemporario?: AnexoEmpresa) => void;
  onVoltar: () => void;
}

interface AnexoTemporarioPendente {
  nomeArquivo: string;
  linhas: unknown[][];
  colunas: AnexoColunas | null;
}

export function TelaInstrucoes({ empresa, onComecar, onVoltar }: TelaInstrucoesProps) {
  const [texto, setTexto] = useState(empresa.instrucoesPersonalizadas);
  const [anexoTemporario, setAnexoTemporario] = useState<AnexoEmpresa | null>(null);
  const [pendente, setPendente] = useState<AnexoTemporarioPendente | null>(null);
  const inputAnexoRef = useRef<HTMLInputElement>(null);

  async function handleArquivo(arquivo: File) {
    const buffer = await arquivo.arrayBuffer();
    const linhas = lerLinhasAnexo(buffer);
    const colunas = detectarColunasAnexo(linhas);
    if (colunas) {
      confirmarAnexo(arquivo.name, linhas, colunas);
    } else {
      setPendente({ nomeArquivo: arquivo.name, linhas, colunas: null });
    }
  }

  function confirmarAnexo(nomeArquivo: string, linhas: unknown[][], colunas: AnexoColunas) {
    const linhasParseadas = parsearAnexo(linhas, colunas);
    const anexo: AnexoEmpresa = {
      id: gerarId(),
      nome: `Temporário (${nomeArquivo})`,
      ativo: true,
      colunas,
      linhas: linhasParseadas,
      criadoEm: new Date().toISOString(),
    };
    setAnexoTemporario(anexo);
    setPendente(null);
    if (inputAnexoRef.current) inputAnexoRef.current.value = "";
  }

  function removerAnexoTemporario() {
    setAnexoTemporario(null);
    if (inputAnexoRef.current) inputAnexoRef.current.value = "";
  }

  const anexosSalvosAtivos = empresa.anexos.filter((a) => a.ativo);

  return (
    <div className="card">
      <h2 className="sem-margem-topo">Instruções para este processamento</h2>
      <p className="campo-ajuda">
        Pré-preenchido com as instruções salvas em <strong>{empresa.nome}</strong>. Edite à vontade —
        vale só para esta execução.
      </p>
      <div className="campo">
        <textarea
          rows={6}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder='Ex.: "Considerar regime cumulativo de PIS/COFINS." / "Esta empresa não trabalha com cigarros — marcar como dúvida." / "Considerar redução de 60% para produtos de limpeza."'
        />
      </div>

      <div className="anexos-secao">
        <h3>Anexo de ST para esta rodada (opcional)</h3>
        <p className="campo-ajuda">
          {anexosSalvosAtivos.length > 0
            ? `Por padrão, esta rodada usa o(s) anexo(s) ativo(s) salvos na empresa: ${anexosSalvosAtivos
                .map((a) => a.nome)
                .join(", ")}.`
            : "A empresa não tem nenhum anexo de ST ativo salvo no cadastro."}{" "}
          Se você subir um anexo aqui, ele <strong>substitui temporariamente</strong> os anexos da
          empresa só para esta rodada — o cadastro salvo não é alterado.
        </p>

        {anexoTemporario && (
          <div className="disclaimer">
            Anexo temporário ativo para esta rodada: <strong>{anexoTemporario.nome}</strong> (
            {anexoTemporario.linhas.length} NCM(s)). Ele substitui qualquer anexo salvo na empresa
            enquanto durar este processamento.
            <div className="actions-row">
              <button type="button" className="secondary" onClick={removerAnexoTemporario}>
                Remover anexo temporário
              </button>
            </div>
          </div>
        )}

        {!anexoTemporario && !pendente && (
          <div className="campo">
            <input
              ref={inputAnexoRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) handleArquivo(arquivo);
              }}
            />
          </div>
        )}

        {pendente && (
          <MapeamentoColunasAnexo
            cabecalho={pendente.linhas[0] ?? []}
            onConfirmar={(colunas) => confirmarAnexo(pendente.nomeArquivo, pendente.linhas, colunas)}
            onCancelar={() => {
              setPendente(null);
              if (inputAnexoRef.current) inputAnexoRef.current.value = "";
            }}
          />
        )}
      </div>

      <div className="actions-row">
        <button type="button" onClick={() => onComecar(texto, anexoTemporario ?? undefined)}>
          Começar processamento
        </button>
        <button type="button" className="secondary" onClick={onVoltar}>
          Voltar
        </button>
      </div>
    </div>
  );
}
