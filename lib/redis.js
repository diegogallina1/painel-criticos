// Cliente Redis compartilhado (Upstash, via integração de Storage da
// Vercel). Usado tanto pelo rate limit (lib/rate-limit.js) quanto pela
// caixa de sugestões (app/api/sugestao/route.js) — uma conexão só,
// reaproveitada pelos dois.
import { Redis } from "@upstash/redis";

// Vercel injeta as credenciais do Redis conectado com nomes que variam
// conforme o fluxo usado pra conectar (Upstash direto vs. "Vercel KV"
// legado vs. Marketplace mais recente). Checamos as variantes mais comuns
// em vez de depender de um nome só.
const CANDIDATOS = [
  { url: "UPSTASH_REDIS_REST_URL", token: "UPSTASH_REDIS_REST_TOKEN" },
  { url: "KV_REST_API_URL", token: "KV_REST_API_TOKEN" },
];

function credenciaisRedis() {
  for (const { url, token } of CANDIDATOS) {
    if (process.env[url] && process.env[token]) {
      return { url: process.env[url], token: process.env[token], via: url };
    }
  }
  return null;
}

const credenciais = credenciaisRedis();

// Log de diagnóstico (uma vez por instância fria) — visível em Vercel >
// Runtime Logs. Ajuda a confirmar se as env vars foram encontradas sem
// precisar de tentativa e erro no site ao vivo.
if (credenciais) {
  console.log(`[redis] conectado via ${credenciais.via}`);
} else {
  console.log(
    `[redis] nenhuma env var encontrada (checado: ${CANDIDATOS.map((c) => c.url).join(", ")}) — rate limit e sugestões ficam desativados até conectar um Redis`
  );
}

// null quando não há Redis conectado — todo código que usa isso precisa
// tratar esse caso (fail-open no rate limit, "não consegui salvar" na
// caixa de sugestões).
export const redis = credenciais
  ? new Redis({ url: credenciais.url, token: credenciais.token })
  : null;
