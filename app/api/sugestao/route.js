import { redis } from "../../../lib/redis";
import { verificarLimiteDiario } from "../../../lib/rate-limit";
import { origemPermitida } from "../../../lib/origin-guard";

export const runtime = "nodejs";

const MAX_NOME = 80;
const MAX_MENSAGEM = 2000;
const CHAVE_LISTA = "painel:sugestoes";
const MAX_SUGESTOES_GUARDADAS = 500;

export async function POST(request) {
  if (!origemPermitida(request)) {
    return Response.json({ erro: "Origem não permitida." }, { status: 403 });
  }

  const { limitado } = await verificarLimiteDiario(request, {
    prefixo: "sugestao",
    requisicoes: 5,
  });
  if (limitado) {
    return Response.json(
      { erro: "Limite de sugestões por hoje atingido. Tenta de novo amanhã." },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const mensagem = (body?.mensagem || "").toString().trim().slice(0, MAX_MENSAGEM);
  const nome = (body?.nome || "").toString().trim().slice(0, MAX_NOME);

  if (!mensagem) {
    return Response.json({ erro: "Escreve alguma coisa na sugestão antes de enviar." }, { status: 400 });
  }

  if (!redis) {
    // Sem Redis conectado não tem onde guardar. Não falha a UX do
    // visitante por isso — só registra no log do servidor pra não perder
    // silenciosamente caso alguém esteja de fato tentando mandar algo.
    console.log("[sugestao] Redis não configurado — sugestão recebida mas não pôde ser salva.");
    return Response.json({ ok: true, salvo: false });
  }

  try {
    await redis.lpush(
      CHAVE_LISTA,
      JSON.stringify({ nome: nome || null, mensagem, data: new Date().toISOString() })
    );
    // Guarda só as N mais recentes — isso é uma caixa de sugestões, não um
    // banco de dados de verdade, não precisa crescer pra sempre.
    await redis.ltrim(CHAVE_LISTA, 0, MAX_SUGESTOES_GUARDADAS - 1);
  } catch (e) {
    console.error("[sugestao] erro salvando no Redis:", e?.message || e);
    return Response.json(
      { erro: "Não consegui salvar sua sugestão agora. Tenta de novo em instantes." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, salvo: true });
}
