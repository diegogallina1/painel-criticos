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

// IPv6 é chaveado pelo /64, não pelo endereço inteiro.
//
// Em IPv4 o endereço inteiro é chave justa, porque endereço custa dinheiro.
// Em IPv6 não: um VPS de poucos dólares recebe um /64 roteado, ou seja 2^64
// endereços de origem legítimos, e cada um ganhava um balde novo de 5 por dia.
// O teto diário simplesmente deixava de existir para quem tem IPv6, que é o
// único teto de gasto que este projeto tem no código.
//
// Cortar no /64 não elimina o contorno: quem tem um /48 ainda controla 65.536
// prefixos. Mas tira o contorno de graça, que era o problema.
export function prefixoDeRede(ip) {
  if (!ip.includes(":")) return ip; // IPv4, ou "desconhecido"

  // ::ffff:1.2.3.4 é IPv4 vestido de IPv6: conta como IPv4.
  const mapeado = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapeado) return mapeado[1];

  const semZona = ip.split("%")[0];
  let grupos;
  if (semZona.includes("::")) {
    const [antes, depois = ""] = semZona.split("::");
    const a = antes ? antes.split(":") : [];
    const d = depois ? depois.split(":") : [];
    grupos = [...a, ...Array(Math.max(0, 8 - a.length - d.length)).fill("0"), ...d];
  } else {
    grupos = semZona.split(":");
  }

  return grupos.slice(0, 4).map((g) => (g || "0").padStart(4, "0")).join(":") + "::/64";
}

function ipDoRequest(request) {
  // ipAddress() é a forma oficial da Vercel de extrair o IP do cliente:
  // a Vercel sobrescreve x-forwarded-for na borda e não repassa valores
  // externos, então esse helper não é falsificável pelo próprio cliente
  // (diferente de ler x-forwarded-for na mão, que fica sujeito a como a
  // string é montada).
  return prefixoDeRede(ipAddress(request) || "desconhecido");
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
