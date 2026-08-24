// Rate limiting diário por IP, via Upstash Redis (Vercel Marketplace).
//
// Por que Upstash e não o Rate Limiting nativo do Vercel Firewall: a janela
// máxima suportada pelas regras do Firewall é de 1 hora (3.600 segundos) —
// não dá pra configurar "5 por dia" diretamente por lá. O Upstash aceita
// qualquer janela ("1 d", "24 h" etc.), então é o jeito certo de fazer um
// limite diário de verdade sem precisar rodar um banco de dados próprio.
//
// Setup necessário (uma vez, no dashboard da Vercel): Project → Storage →
// Create Database → Upstash → Redis (tem camada gratuita) → Connect ao
// projeto. Ver lib/redis.js pros detalhes de conexão.
//
// Se não houver Redis conectado, o limite simplesmente não é aplicado
// (fail-open) — o app continua funcionando normalmente, só sem o teto
// diário.

import { Ratelimit } from "@upstash/ratelimit";
import { ipAddress } from "@vercel/functions";
import { redis } from "./redis";

const limitadores = new Map();

function getLimitador(prefixo, requisicoes, janela) {
  if (!redis) return null;
  if (!limitadores.has(prefixo)) {
    limitadores.set(
      prefixo,
      new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requisicoes, janela),
        prefix: `painel:${prefixo}`,
        analytics: false,
      })
    );
  }
  return limitadores.get(prefixo);
}

function ipDoRequest(request) {
  // ipAddress() é a forma oficial da Vercel de extrair o IP do cliente:
  // a Vercel sobrescreve x-forwarded-for na borda e não repassa valores
  // externos, então esse helper não é falsificável pelo próprio cliente
  // (diferente de ler x-forwarded-for na mão, que fica sujeito a como a
  // string é montada).
  return ipAddress(request) || "desconhecido";
}

/**
 * Verifica o limite diário para um identificador de rota (ex.: "analyze").
 * Retorna { limitado: boolean } — nunca lança erro pro chamador (fail-open
 * em qualquer falha de configuração ou de rede com o Redis).
 */
export async function verificarLimiteDiario(request, {
  prefixo,
  requisicoes,
  janela = "1 d",
}) {
  const limitador = getLimitador(prefixo, requisicoes, janela);
  if (!limitador) return { limitado: false };

  try {
    const ip = ipDoRequest(request);
    const { success } = await limitador.limit(ip);
    return { limitado: !success };
  } catch (e) {
    console.error(`[rate-limit:${prefixo}] erro checando limite:`, e?.message || e);
    return { limitado: false };
  }
}
