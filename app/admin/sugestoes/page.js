"use client";

import { useEffect, useState } from "react";

const CHAVE_SESSAO = "painel-admin-token";

function formatarData(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminSugestoes() {
  const [token, setToken] = useState("");
  const [autenticado, setAutenticado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sugestoes, setSugestoes] = useState([]);

  // Aplica o tema salvo (mesma lógica da home) só pra não abrir sempre no claro.
  useEffect(() => {
    const salvo = typeof window !== "undefined" ? window.localStorage.getItem("painel-tema") : null;
    if (salvo) document.documentElement.dataset.tema = salvo;
  }, []);

  async function buscar(tokenUsado) {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/admin/sugestoes", {
        headers: { "x-admin-token": tokenUsado },
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        throw new Error(dados?.erro || "Não consegui carregar as sugestões.");
      }
      setSugestoes(dados.sugestoes || []);
      setAutenticado(true);
      // Guarda o token só na sessão (some ao fechar a aba), nunca em
      // localStorage persistente.
      try {
        window.sessionStorage.setItem(CHAVE_SESSAO, tokenUsado);
      } catch {
        // sessionStorage pode falhar em modo privado, não é crítico.
      }
    } catch (e) {
      setErro(e.message);
      setAutenticado(false);
    } finally {
      setCarregando(false);
    }
  }

  // Reaproveita o token da sessão, se existir, pra não pedir de novo a cada reload.
  useEffect(() => {
    let salvo = null;
    try {
      salvo = window.sessionStorage.getItem(CHAVE_SESSAO);
    } catch {
      salvo = null;
    }
    if (salvo) {
      setToken(salvo);
      buscar(salvo);
    }
  }, []);

  function entrar(e) {
    e.preventDefault();
    if (!token.trim() || carregando) return;
    buscar(token.trim());
  }

  function sair() {
    try {
      window.sessionStorage.removeItem(CHAVE_SESSAO);
    } catch {
      // ignora
    }
    setAutenticado(false);
    setSugestoes([]);
    setToken("");
  }

  return (
    <div className="pagina">
      <header className="cabecalho">
        <h1>Sugestões recebidas</h1>
        <p>Área restrita. Somente para o administrador do painel.</p>
      </header>

      {!autenticado ? (
        <form className="secao-sugestao admin-login" onSubmit={entrar}>
          <h3>Acesso restrito</h3>
          <p>Informe o token de administrador para ver as sugestões.</p>
          <input
            type="password"
            className="campo-sugestao-nome"
            placeholder="Token de administrador"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="current-password"
          />
          <button type="submit" className="botao-sugestao" disabled={!token.trim() || carregando}>
            {carregando ? "Verificando..." : "Entrar"}
          </button>
          {erro && <div className="erro" style={{ marginTop: 12, marginBottom: 0 }}>{erro}</div>}
        </form>
      ) : (
        <section className="secao-sugestao">
          <div className="admin-barra">
            <h3>{sugestoes.length} sugestão(ões)</h3>
            <div className="admin-acoes">
              <button
                type="button"
                className="botao-arquivo"
                onClick={() => buscar(token)}
                disabled={carregando}
              >
                {carregando ? "Atualizando..." : "Atualizar"}
              </button>
              <button type="button" className="botao-arquivo" onClick={sair}>
                Sair
              </button>
            </div>
          </div>

          {erro && <div className="erro">{erro}</div>}

          {sugestoes.length === 0 && !carregando && (
            <p className="admin-vazio">Nenhuma sugestão por enquanto.</p>
          )}

          <ul className="admin-lista">
            {sugestoes.map((s, i) => (
              <li key={i} className="admin-item">
                <div className="admin-item-topo">
                  <span className="admin-item-nome">{s.nome || "Anônimo"}</span>
                  <span className="admin-item-data">{formatarData(s.data)}</span>
                </div>
                <p className="admin-item-mensagem">{s.mensagem}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
