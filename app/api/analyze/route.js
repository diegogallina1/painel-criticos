import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { verificarLimiteDiario } from "../../../lib/rate-limit";
import { origemPermitida } from "../../../lib/origin-guard";
import { getPersonas } from "../../../lib/personas";
import { MAX_CARACTERES } from "../../../lib/config";

export const runtime = "nodejs";

const CLAUDE_MODEL = "claude-sonnet-5";
const GEMINI_MODEL = "gemini-3.6-flash";

function montarPrompt(texto, personas) {
  const descricaoPersonas = personas
    .map(
      (p, i) =>
        `${i + 1}. id="${p.id}" | ${p.nome}, ${p.apelido} — ${p.vozDescricao}`
    )
    .join("\n");

  const schema = `{
  "veredito": "uma frase resumindo o consenso (ou a falta dele) entre as quatro reações",
  "personas": [
    {
      "id": "id exatamente igual ao da lista de personas",
      "nota": 0,
      "reacao": "reação geral em 2 a 3 frases, em primeira pessoa, na voz da persona",
      "oQueMePerdeu": [
        "trecho específico do texto (cite a passagem entre aspas) e o motivo do incômodo",
        "outro trecho, se houver"
      ],
      "sugestao": "uma sugestão concreta de melhoria, na voz da persona"
    }
  ]
}`;

  return `Você vai simular a leitura de um texto por quatro leitores fictícios, cada um com personalidade e critério de julgamento bem diferentes. Leia o texto com atenção e reaja como cada persona reagiria de verdade, incluindo irritação, entusiasmo ou impaciência quando fizer sentido.

PERSONAS:
${descricaoPersonas}

TEXTO A AVALIAR:
"""
${texto}
"""

Para cada persona, dê uma nota de 0 a 10 (nota inteira, coerente com a reação), uma reação em primeira pessoa na voz dela, de 2 a 3 frases, uma lista de 2 a 3 pontos específicos do texto que a incomodaram — cada um citando um trecho real do texto entre aspas — e uma sugestão concreta de melhoria.

Também escreva um "veredito" de uma frase só, resumindo o consenso (ou a divergência) entre as quatro reações.

Responda APENAS com um JSON válido, sem markdown, sem crases, sem texto antes ou depois, seguindo exatamente este formato:

${schema}`;
}

// Dois provedores suportados. GEMINI_API_KEY tem prioridade porque a Gemini
// API tem camada gratuita permanente (sem cartão); ANTHROPIC_API_KEY é o
// fallback pago, com melhor qualidade de resposta. Definir só uma das duas.
async function chamarGemini(prompt) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const resposta = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
    },
  });

  return resposta.text?.trim();
}

async function chamarClaude(prompt) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const mensagem = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  return mensagem.content
    ?.filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("")
    .trim();
}

export async function POST(request) {
  if (!origemPermitida(request)) {
    return Response.json({ erro: "Origem não permitida." }, { status: 403 });
  }

  // Limite gratuito diário por IP, para o app aguentar uso público sem
  // custo explodir. Ver lib/rate-limit.js — sem Upstash conectado no
  // projeto, isso não bloqueia ninguém (fail-open).
  const { limitado } = await verificarLimiteDiario(request, {
    prefixo: "analyze",
    requisicoes: 5,
  });
  if (limitado) {
    return Response.json(
      {
        erro:
          "Você atingiu o limite gratuito de usos por hoje. Volta amanhã, ou roda o projeto localmente com sua própria chave de API (repositório aberto, link no rodapé).",
      },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const texto = (body?.texto || "").toString().trim();
  const contentType = (body?.contentType || "cientifico").toString();

  if (!texto) {
    return Response.json({ erro: "Cole um texto antes de reunir o painel." }, { status: 400 });
  }

  if (texto.length > MAX_CARACTERES) {
    return Response.json(
      { erro: `Texto longo demais (limite de ${MAX_CARACTERES} caracteres).` },
      { status: 400 }
    );
  }

  const temGemini = Boolean(process.env.GEMINI_API_KEY);
  const temClaude = Boolean(process.env.ANTHROPIC_API_KEY);

  if (!temGemini && !temClaude) {
    return Response.json(
      {
        erro:
          "Nenhuma chave de API configurada no servidor. Adicione GEMINI_API_KEY (gratuita, aistudio.google.com) ou ANTHROPIC_API_KEY nas variáveis de ambiente do projeto (Vercel: Settings → Environment Variables) e faça um novo deploy.",
      },
      { status: 500 }
    );
  }

  const personas = getPersonas(contentType);
  const prompt = montarPrompt(texto, personas);

  let respostaBruta;
  try {
    respostaBruta = temGemini ? await chamarGemini(prompt) : await chamarClaude(prompt);
  } catch (e) {
    const provedor = temGemini ? "Gemini" : "Claude";
    // Log completo só no servidor (visível em Vercel > Runtime Logs). A
    // resposta pro cliente fica genérica de propósito: mensagem de erro de
    // provedor de IA pode conter detalhe interno que não deve vazar pra
    // quem estiver usando o site publicamente.
    console.error(`[analyze] erro chamando ${provedor}:`, e?.status, e?.message, e?.errorDetails || e?.response?.data || e);
    return Response.json(
      { erro: `Falha ao chamar a API do ${provedor}. Tenta de novo em instantes.` },
      { status: 502 }
    );
  }

  if (!respostaBruta) {
    return Response.json(
      { erro: "A API não retornou conteúdo. Tenta de novo." },
      { status: 502 }
    );
  }

  // Limpeza defensiva: remove cercas de código markdown, caso o modelo
  // ignore a instrução de responder só com JSON puro (a Gemini já força
  // isso via responseMimeType, mas o Claude depende só da instrução).
  const limpo = respostaBruta
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let dados;
  try {
    dados = JSON.parse(limpo);
  } catch {
    return Response.json(
      {
        erro:
          "Não consegui interpretar a resposta do painel dessa vez (JSON inválido). Tenta reunir o painel de novo.",
      },
      { status: 502 }
    );
  }

  if (!dados || !Array.isArray(dados.personas)) {
    return Response.json(
      { erro: "Resposta do painel veio incompleta. Tenta de novo." },
      { status: 502 }
    );
  }

  return Response.json(dados);
}
