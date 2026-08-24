"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIAS, CONTENT_TYPES, EXEMPLO_DEMO, getPersonas } from "../lib/personas";
import { MAX_CARACTERES, EXTENSOES_ACEITAS } from "../lib/config";

const LIMITE_DIARIO_ANALISES = 5;

function normalizar(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function useTema() {
  const [tema, setTema] = useState("claro");

  useEffect(() => {
    const salvo = typeof window !== "undefined" ? window.localStorage.getItem("painel-tema") : null;
    const preferido =
      salvo || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro");
    setTema(preferido);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try {
      window.localStorage.setItem("painel-tema", tema);
    } catch {
      // localStorage pode falhar em modo privado — não é crítico, o tema só não persiste.
    }
  }, [tema]);

  return [tema, setTema];
}

export default function Home() {
  const [tema, setTema] = useTema();
  const [tipo, setTipo] = useState("cientifico");
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [arquivoNome, setArquivoNome] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [exemploAtivo, setExemploAtivo] = useState(false);
  const inputArquivoRef = useRef(null);

  const [buscaTipo, setBuscaTipo] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const seletorRef = useRef(null);

  const [sugestaoNome, setSugestaoNome] = useState("");
  const [sugestaoMensagem, setSugestaoMensagem] = useState("");
  const [enviandoSugestao, setEnviandoSugestao] = useState(false);
  const [sugestaoStatus, setSugestaoStatus] = useState(null); // null | "ok" | mensagem de erro

  const tipoAtual = CONTENT_TYPES.find((t) => t.id === tipo) || CONTENT_TYPES[0];
  const personas = useMemo(() => getPersonas(tipo), [tipo]);
  const excedeLimite = texto.length > MAX_CARACTERES;

  const tiposFiltrados = useMemo(() => {
    const busca = normalizar(buscaTipo.trim());
    if (!busca) return CONTENT_TYPES;
    return CONTENT_TYPES.filter((t) => normalizar(t.label).includes(busca));
  }, [buscaTipo]);

  useEffect(() => {
    function aoClicarFora(e) {
      if (seletorRef.current && !seletorRef.current.contains(e.target)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function alternarTema() {
    setTema((t) => (t === "claro" ? "escuro" : "claro"));
  }

  function selecionarTipo(id) {
    setTipo(id);
    setExemploAtivo(false);
    setResultado(null);
    setBuscaTipo("");
    setDropdownAberto(false);
  }

  function verExemplo() {
    setTipo(EXEMPLO_DEMO.contentType);
    setTexto(EXEMPLO_DEMO.texto);
    setArquivoNome(null);
    setErro(null);
    setAviso(null);
    setResultado(EXEMPLO_DEMO.resultado);
    setExemploAtivo(true);
  }

  async function selecionarArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    const ext = "." + (arquivo.name.split(".").pop() || "").toLowerCase();
    if (!EXTENSOES_ACEITAS.includes(ext)) {
      setErro(`Formato ${ext} não suportado. Envie ${EXTENSOES_ACEITAS.join(", ")}.`);
      e.target.value = "";
      return;
    }

    setExtraindo(true);
    setErro(null);
    setAviso(null);
    setExemploAtivo(false);

    try {
      const formData = new FormData();
      formData.append("arquivo", arquivo);

      const resposta = await fetch("/api/extract", { method: "POST", body: formData });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados?.erro || "Não consegui ler esse arquivo.");
      }

      setTexto(dados.texto);
      setArquivoNome(dados.nomeArquivo);
      if (dados.truncado) {
        setAviso(
          `O arquivo tinha mais texto do que o limite de ${MAX_CARACTERES.toLocaleString("pt-BR")} caracteres — cortei o excedente pra você poder continuar.`
        );
      }
    } catch (err) {
      setErro(err.message || "Não consegui ler esse arquivo. Tenta colar o texto direto.");
    } finally {
      setExtraindo(false);
      e.target.value = "";
    }
  }

  function limparArquivo() {
    setArquivoNome(null);
    setTexto("");
  }

  async function reunirPainel() {
    if (!texto.trim() || carregando || excedeLimite) return;
    setCarregando(true);
    setErro(null);
    setAviso(null);
    setResultado(null);
    setExemploAtivo(false);

    try {
      const resposta = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, contentType: tipo }),
      });

      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados?.erro || "Não consegui reunir o painel dessa vez.");
      }

      setResultado(dados);
    } catch (e) {
      setErro(e.message || "Não consegui reunir o painel dessa vez. Tenta de novo?");
    } finally {
      setCarregando(false);
    }
  }

  async function enviarSugestao() {
    if (!sugestaoMensagem.trim() || enviandoSugestao) return;
    setEnviandoSugestao(true);
    setSugestaoStatus(null);

    try {
      const resposta = await fetch("/api/sugestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: sugestaoNome, mensagem: sugestaoMensagem }),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        throw new Error(dados?.erro || "Não consegui enviar sua sugestão.");
      }

      setSugestaoStatus("ok");
      setSugestaoMensagem("");
      setSugestaoNome("");
    } catch (e) {
      setSugestaoStatus(e.message || "Não consegui enviar sua sugestão. Tenta de novo?");
    } finally {
      setEnviandoSugestao(false);
    }
  }

  const mediaNota =
    resultado?.personas?.length > 0
      ? (resultado.personas.reduce((soma, p) => soma + (Number(p.nota) || 0), 0) / resultado.personas.length).toFixed(1)
      : null;

  return (
    <div className="pagina">
      <header className="cabecalho">
        <button
          type="button"
          className="botao-tema"
          onClick={alternarTema}
          aria-label={tema === "claro" ? "Ativar tema escuro" : "Ativar tema claro"}
          title={tema === "claro" ? "Tema escuro" : "Tema claro"}
        >
          {tema === "claro" ? "🌙" : "☀️"}
        </button>
        <h1>Painel de Leitores Sintéticos</h1>
        <p>Cole um texto (ou envie um arquivo) e veja como quatro leitores bem diferentes reagem a ele.</p>
        <p className="limite-diario">⏳ {LIMITE_DIARIO_ANALISES} análises grátis por dia (por IP) — volta amanhã pra mais.</p>
        <button type="button" className="botao-exemplo" onClick={verExemplo}>
          👀 Ver um exemplo de resultado
        </button>
      </header>

      <div className="seletor-tipo-busca" ref={seletorRef}>
        <button
          type="button"
          className="campo-tipo-atual"
          onClick={() => setDropdownAberto((a) => !a)}
          aria-expanded={dropdownAberto}
        >
          <span>{tipoAtual.label}</span>
          <span className="seta-dropdown">{dropdownAberto ? "▲" : "▼"}</span>
        </button>

        {dropdownAberto && (
          <div className="dropdown-tipo">
            <input
              type="text"
              autoFocus
              className="busca-tipo-input"
              placeholder="Buscar tipo de texto (ex: TCC, valuation, currículo)..."
              value={buscaTipo}
              onChange={(e) => setBuscaTipo(e.target.value)}
            />
            <div className="dropdown-tipo-lista">
              {CATEGORIAS.map((cat) => {
                const itens = tiposFiltrados.filter((t) => t.categoria === cat.id);
                if (itens.length === 0) return null;
                return (
                  <div key={cat.id} className="dropdown-grupo">
                    <div className="dropdown-grupo-titulo">{cat.label}</div>
                    {itens.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={"dropdown-item" + (t.id === tipo ? " ativo" : "")}
                        onClick={() => selecionarTipo(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                );
              })}
              {tiposFiltrados.length === 0 && <div className="dropdown-vazio">Nenhum tipo encontrado.</div>}
            </div>
          </div>
        )}
      </div>

      <div className="painel-entrada">
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            if (arquivoNome) setArquivoNome(null);
            if (exemploAtivo) {
              setExemploAtivo(false);
              setResultado(null);
            }
          }}
          placeholder={tipoAtual.placeholder}
          disabled={extraindo}
        />

        <div className="linha-arquivo">
          <input
            ref={inputArquivoRef}
            type="file"
            accept={EXTENSOES_ACEITAS.join(",")}
            onChange={selecionarArquivo}
            style={{ display: "none" }}
          />
          <button type="button" className="botao-arquivo" onClick={() => inputArquivoRef.current?.click()} disabled={extraindo}>
            {extraindo ? "Lendo arquivo..." : "📎 Enviar arquivo (.docx, .pdf, .txt, .md)"}
          </button>
          {arquivoNome && !extraindo && (
            <span className="chip-arquivo">
              {arquivoNome}
              <button type="button" onClick={limparArquivo} aria-label="Remover arquivo">×</button>
            </span>
          )}
        </div>

        <div className="linha-acao">
          <span className={excedeLimite ? "contagem contagem-excedida" : "contagem"}>
            {texto.trim() ? texto.trim().split(/\s+/).filter(Boolean).length : 0} palavras
            {excedeLimite && ` — passou do limite de ${MAX_CARACTERES.toLocaleString("pt-BR")} caracteres, corte um pouco`}
          </span>
          <button className="botao-reunir" onClick={reunirPainel} disabled={!texto.trim() || carregando || extraindo || excedeLimite}>
            {carregando ? "Reunindo o painel..." : "Reunir o painel"}
          </button>
        </div>
      </div>

      {aviso && <div className="aviso">{aviso}</div>}
      {erro && <div className="erro">{erro}</div>}

      {exemploAtivo && resultado && (
        <div className="badge-exemplo">
          🔎 Isto é um exemplo ilustrativo, já pronto — não usa a sua cota diária. Cole seu próprio texto acima pra rodar de verdade.
        </div>
      )}

      {carregando && (
        <div className="grade-cards">
          {personas.map((p) => (
            <div key={p.id} className="card-persona card-carregando" style={{ "--cor-persona": p.cor }}>
              <div className="card-persona-cabeca">
                <div className="avatar-persona">{p.avatar}</div>
                <div className="identidade-persona">
                  <div className="nome">{p.nome}</div>
                  <div className="apelido">{p.apelido}</div>
                </div>
              </div>
              <p className="reacao-persona"><span className="pulso">{p.fraseCarregando}</span></p>
            </div>
          ))}
        </div>
      )}

      {!carregando && resultado && (
        <>
          <div className="grade-cards">
            {personas.map((p) => {
              const r = resultado.personas?.find((x) => x.id === p.id);
              if (!r) return null;
              return (
                <div key={p.id} className="card-persona" style={{ "--cor-persona": p.cor }}>
                  <div className="card-persona-cabeca">
                    <div className="avatar-persona">{p.avatar}</div>
                    <div className="identidade-persona">
                      <div className="nome">{p.nome}</div>
                      <div className="apelido">{p.apelido}</div>
                    </div>
                    <div className="nota-persona">{r.nota}<span>/10</span></div>
                  </div>

                  <p className="reacao-persona">&ldquo;{r.reacao}&rdquo;</p>

                  {Array.isArray(r.oQueMePerdeu) && r.oQueMePerdeu.length > 0 && (
                    <div className="bloco-secao">
                      <h4>O que me perdeu</h4>
                      <ul className="lista-perdeu">
                        {r.oQueMePerdeu.map((item, i) => (<li key={i}>{item}</li>))}
                      </ul>
                    </div>
                  )}

                  {r.sugestao && (
                    <div className="bloco-secao">
                      <h4>Sugestão</h4>
                      <div className="bloco-sugestao">{r.sugestao}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="veredito">
            <h3>Veredito do painel</h3>
            <div className="media-nota">{mediaNota}/10</div>
            <p className="frase-consenso">{resultado.veredito}</p>
          </div>
        </>
      )}

      <section className="secao-sugestao">
        <h3>Sugestões</h3>
        <p>Tem uma ideia, achou um bug, ou quer um tipo de texto novo? Manda aqui.</p>
        <input
          type="text"
          className="campo-sugestao-nome"
          placeholder="Seu nome (opcional)"
          maxLength={80}
          value={sugestaoNome}
          onChange={(e) => setSugestaoNome(e.target.value)}
        />
        <textarea
          className="campo-sugestao-mensagem"
          placeholder="Sua sugestão..."
          maxLength={2000}
          value={sugestaoMensagem}
          onChange={(e) => setSugestaoMensagem(e.target.value)}
        />
        <button
          type="button"
          className="botao-sugestao"
          onClick={enviarSugestao}
          disabled={!sugestaoMensagem.trim() || enviandoSugestao}
        >
          {enviandoSugestao ? "Enviando..." : "Enviar sugestão"}
        </button>
        {sugestaoStatus === "ok" && <div className="sucesso">Valeu! Sugestão recebida.</div>}
        {sugestaoStatus && sugestaoStatus !== "ok" && <div className="erro">{sugestaoStatus}</div>}
      </section>

      <footer className="rodape-repo">
        <p>Painel de Leitores Sintéticos — as reações são geradas por IA e não substituem leitores de verdade.</p>
        <p>🔒 Seu texto não é armazenado: é enviado direto pra IA gerar a análise e descartado logo em seguida. A única coisa que fica salva, e só se você escolher enviar, é o conteúdo da caixa de sugestões acima.</p>
        <p>
          Uso gratuito limitado a {LIMITE_DIARIO_ANALISES} análises por dia. Código aberto no{" "}
          <a href="https://github.com/diegogallina1/painel-criticos" target="_blank" rel="noopener noreferrer">GitHub</a>{" "}
          — rode localmente com sua própria chave de API se quiser usar sem limite.
        </p>
      </footer>
    </div>
  );
}
