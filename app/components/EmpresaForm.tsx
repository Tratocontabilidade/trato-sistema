"use client";

import { useRef, useState } from "react";
import {
  REGIMES_TRIBUTARIOS,
  criarEmpresa,
  salvarEmpresa,
  type AnexoColunas,
  type AnexoEmpresa,
  type Empresa,
  type RegimeTributario,
} from "@/lib/empresas";
import { gerarId } from "@/lib/armazenamento";
import { detectarColunasAnexo, lerLinhasAnexo, parsearAnexo } from "@/lib/anexos";
import { MapeamentoColunasAnexo } from "./MapeamentoColunasAnexo";

interface EmpresaFormProps {
  empresa?: Empresa;
  onSalvar: (empresa: Empresa) => void;
  onCancelar?: () => void;
}

interface NovoAnexoPendente {
  nomeArquivo: string;
  linhas: unknown[][];
  colunas: AnexoColunas | null;
}

export function EmpresaForm({ empresa, onSalvar, onCancelar }: EmpresaFormProps) {
  const [nome, setNome] = useState(empresa?.nome ?? "");
  const [cnpj, setCnpj] = useState(empresa?.cnpj ?? "");
  const [ramo, setRamo] = useState(empresa?.ramo ?? "Supermercado");
  const [uf, setUf] = useState(empresa?.uf ?? "BA");
  const [regimeTributario, setRegimeTributario] = useState<RegimeTributario>(
    empresa?.regimeTributario ?? "Lucro Presumido"
  );
  const [instrucoesPersonalizadas, setInstrucoesPersonalizadas] = useState(
    empresa?.instrucoesPersonalizadas ?? ""
  );

  const [anexos, setAnexos] = useState<AnexoEmpresa[]>(empresa?.anexos ?? []);
  const [novoAnexo, setNovoAnexo] = useState<NovoAnexoPendente | null>(null);
  const [novoAnexoNome, setNovoAnexoNome] = useState("");
  const inputAnexoRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;

    if (empresa) {
      const atualizada: Empresa = {
        ...empresa,
        nome: nome.trim(),
        cnpj: cnpj.trim(),
        ramo: ramo.trim() || "Supermercado",
        uf: uf.trim().toUpperCase() || "BA",
        regimeTributario,
        instrucoesPersonalizadas,
        anexos,
      };
      salvarEmpresa(atualizada);
      onSalvar(atualizada);
    } else {
      const nova = criarEmpresa({
        nome: nome.trim(),
        cnpj: cnpj.trim(),
        ramo: ramo.trim() || "Supermercado",
        uf: uf.trim().toUpperCase() || "BA",
        regimeTributario,
        instrucoesPersonalizadas,
      });
      onSalvar(nova);
    }
  }

  function persistirAnexos(novosAnexos: AnexoEmpresa[]) {
    setAnexos(novosAnexos);
    if (empresa) {
      salvarEmpresa({ ...empresa, anexos: novosAnexos });
    }
  }

  async function handleArquivoAnexo(arquivo: File) {
    const buffer = await arquivo.arrayBuffer();
    const linhas = lerLinhasAnexo(buffer);
    const colunas = detectarColunasAnexo(linhas);
    setNovoAnexo({ nomeArquivo: arquivo.name, linhas, colunas });
    setNovoAnexoNome(arquivo.name.replace(/\.[^.]+$/, ""));
  }

  function confirmarNovoAnexo(colunas: AnexoColunas) {
    if (!novoAnexo) return;
    const linhasParseadas = parsearAnexo(novoAnexo.linhas, colunas);
    const anexo: AnexoEmpresa = {
      id: gerarId(),
      nome: novoAnexoNome.trim() || novoAnexo.nomeArquivo,
      ativo: true,
      colunas,
      linhas: linhasParseadas,
      criadoEm: new Date().toISOString(),
    };
    persistirAnexos([...anexos, anexo]);
    setNovoAnexo(null);
    setNovoAnexoNome("");
    if (inputAnexoRef.current) inputAnexoRef.current.value = "";
  }

  function alternarAtivo(id: string) {
    persistirAnexos(anexos.map((a) => (a.id === id ? { ...a, ativo: !a.ativo } : a)));
  }

  function removerAnexo(id: string) {
    persistirAnexos(anexos.filter((a) => a.id !== id));
  }

  return (
    <>
      <form className="empresa-form" onSubmit={handleSubmit}>
        <div className="campo">
          <label htmlFor="empresa-nome">Nome / Razão social</label>
          <input
            id="empresa-nome"
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Supermercado Exemplo Ltda."
          />
        </div>

        <div className="campo-grid">
          <div className="campo">
            <label htmlFor="empresa-cnpj">CNPJ (opcional)</label>
            <input
              id="empresa-cnpj"
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div className="campo">
            <label htmlFor="empresa-ramo">Ramo de atividade</label>
            <input id="empresa-ramo" type="text" value={ramo} onChange={(e) => setRamo(e.target.value)} />
          </div>

          <div className="campo">
            <label htmlFor="empresa-uf">UF</label>
            <input
              id="empresa-uf"
              type="text"
              value={uf}
              maxLength={2}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
            />
          </div>

          <div className="campo">
            <label htmlFor="empresa-regime">Regime tributário</label>
            <select
              id="empresa-regime"
              value={regimeTributario}
              onChange={(e) => setRegimeTributario(e.target.value as RegimeTributario)}
            >
              {REGIMES_TRIBUTARIOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="empresa-instrucoes">Instruções personalizadas</label>
          <textarea
            id="empresa-instrucoes"
            rows={4}
            value={instrucoesPersonalizadas}
            onChange={(e) => setInstrucoesPersonalizadas(e.target.value)}
            placeholder='Ex.: "Esta empresa não trabalha com bebidas alcoólicas — marcar como dúvida."'
          />
          <p className="campo-ajuda">
            Aparecem pré-preenchidas na tela de instruções de cada processamento, e podem ser ajustadas
            por execução.
          </p>
        </div>

        <div className="actions-row">
          <button type="submit">{empresa ? "Salvar alterações" : "Criar empresa"}</button>
          {onCancelar && (
            <button type="button" className="secondary" onClick={onCancelar}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {empresa && (
        <div className="anexos-secao">
          <h3>Anexos de Substituição Tributária</h3>
          <p className="campo-ajuda">
            Um ou mais anexos (Excel ou CSV) com os NCMs sujeitos a ST na Bahia. Anexos ativos passam
            a decidir a Substituição Tributária no processamento, com prioridade sobre a coluna
            Tributação. Alterações aqui são salvas automaticamente.
          </p>

          {anexos.length > 0 && (
            <ul className="lista-anexos">
              {anexos.map((a) => (
                <li key={a.id} className="anexo-item">
                  <label className="anexo-item-nome">
                    <input type="checkbox" checked={a.ativo} onChange={() => alternarAtivo(a.id)} />
                    {a.nome}
                    <span className="campo-ajuda">({a.linhas.length} NCM(s))</span>
                  </label>
                  <button type="button" className="secondary" onClick={() => removerAnexo(a.id)}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!novoAnexo && (
            <div className="campo">
              <input
                ref={inputAnexoRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) handleArquivoAnexo(arquivo);
                }}
              />
            </div>
          )}

          {novoAnexo && novoAnexo.colunas === null && (
            <MapeamentoColunasAnexo
              cabecalho={novoAnexo.linhas[0] ?? []}
              onConfirmar={confirmarNovoAnexo}
              onCancelar={() => {
                setNovoAnexo(null);
                if (inputAnexoRef.current) inputAnexoRef.current.value = "";
              }}
            />
          )}

          {novoAnexo && novoAnexo.colunas !== null && (
            <div className="campo">
              <label htmlFor="novo-anexo-nome">Nome do anexo</label>
              <input
                id="novo-anexo-nome"
                type="text"
                value={novoAnexoNome}
                onChange={(e) => setNovoAnexoNome(e.target.value)}
                placeholder="Ex.: ST-BA jan/2026"
              />
              <div className="actions-row">
                <button type="button" onClick={() => confirmarNovoAnexo(novoAnexo.colunas as AnexoColunas)}>
                  Adicionar anexo
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setNovoAnexo(null);
                    if (inputAnexoRef.current) inputAnexoRef.current.value = "";
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
