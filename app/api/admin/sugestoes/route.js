import { timingSafeEqual } from "crypto";
import { redis } from "../../../../lib/redis";
import { verificarLimiteDiario } from "../../../../lib/rate-limit";

export const runtime = "nodejs";

const CHAVE_LISTA = "painel:sugestoes";

// Comparação em tempo constante pra não vazar o tamanho/conteúdo do token
// por diferença de tempo de resposta. Retorna false se qualquer um estiver
// ausente ou com tamanhos diferentes.
function tokenValido(recebido) {
  const esperado = process.env.PAINEL_ADMIN_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function extrairToken(request) {
  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-admin-token")?.trim() || null;
}

export async function GET(request) {
  // Redis primeiro, e de propósito: esta era a única rota sem limite de
  // tentativas, e o 401 saía antes de tocar o banco, então cada palpite errado
  // no token era grátis para quem tentava. O token é o único ponto de
  // autorização do sistema inteiro. Aqui o limitador é fail-closed: sem Redis
  // não há como contar tentativa, e a rota já dependia dele mesmo.
  if (!redis) {
    return Response.json({ erro: "Redis não configurado." }, { status: 503 });
  }

  const { limitado } = await verificarLimiteDiario(request, {
    prefixo: "admin",
    requisicoes: 20,
  });
  if (limitado) {
    return Response.json({ erro: "Muitas tentativas. Tente amanhã." }, { status: 429 });
  }

  // Se o token de admin nem foi configurado no servidor, a área fica
  // fechada por padrão (nunca aberta por acidente).
  if (!process.env.PAINEL_ADMIN_TOKEN) {
    return Response.json(
      { erro: "Área administrativa não configurada. Defina PAINEL_ADMIN_TOKEN nas variáveis de ambiente." },
      { status: 503 }
    );
  }

  if (!tokenValido(extrairToken(request))) {
    // Deixa rastro nos Runtime Logs: antes uma tentativa errada não gravava
    // nada em lugar nenhum.
    console.warn("[admin/sugestoes] token inválido");
    return Response.json({ erro: "Não autorizado." }, { status: 401 });
  }

  let brutos = [];
  try {
    brutos = await redis.lrange(CHAVE_LISTA, 0, -1);
  } catch (e) {
    console.error("[admin/sugestoes] erro lendo do Redis:", e?.message || e);
    return Response.json({ erro: "Não consegui ler as sugestões agora." }, { status: 502 });
  }

  // O @upstash/redis pode devolver objetos já parseados ou strings JSON,
  // dependendo do que foi gravado. Normalizamos os dois casos.
  const sugestoes = brutos
    .map((item) => {
      if (item && typeof item === "object") return item;
      try {
        return JSON.parse(item);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return Response.json({ total: sugestoes.length, sugestoes });
}
