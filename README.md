# Painel de Leitores Sintéticos

Cole um texto — ou envie um arquivo `.docx`, `.pdf`, `.txt` ou `.md` — e receba a reação de quatro leitores fictícios com personalidades bem diferentes, gerada em uma única chamada de API.

🔗 **Site público:** https://painel.dgo.fi (uso gratuito, 5 análises por dia por IP)
📦 **Este repositório:** código aberto, pra quem quiser rodar localmente com a própria chave de API e sem limite de uso.

Inspirado pelo trabalho do [Pedro Burgos](https://br.linkedin.com/in/pedromburgos) sobre IA aplicada a jornalismo e criação de conteúdo.

## Como funciona

Você escolhe o tipo de texto (científico, TCC, currículo, valuation, post de LinkedIn etc.), cola ou envia o conteúdo, e o app pede pra um provedor de IA simular a reação de quatro personas fixas pra aquele tipo de texto — cada uma com um critério de leitura diferente. O resultado vem com nota, reação em primeira pessoa, os trechos específicos que incomodaram cada persona e uma sugestão de melhoria.

Duas personas são fixas em todo tipo de texto (Marcão, cético de plantão, e Bebeto, advogado do diabo); as outras duas mudam conforme o formato. Todas usam nomes de jogadores de futebol brasileiros. A lista completa de tipos e personas fica em `lib/personas.js`.

## Rodando local

```bash
npm install
cp .env.example .env.local
# edite .env.local e cole GEMINI_API_KEY ou ANTHROPIC_API_KEY
npm run dev
```

Abra http://localhost:3000. Rodando local não há limite diário de uso.

Defina **uma** das duas chaves de API:

- **`GEMINI_API_KEY`** — gratuita, sem cartão. Gere em [aistudio.google.com](https://aistudio.google.com) → "Get API Key".
- **`ANTHROPIC_API_KEY`** — gere em [console.anthropic.com](https://console.anthropic.com).

Se `GEMINI_API_KEY` estiver definida, ela tem prioridade sobre `ANTHROPIC_API_KEY`.

## Privacidade

O texto que você cola ou envia **não é armazenado**: vai direto pro provedor de IA gerar a análise e é descartado depois. Nada disso fica salvo em banco de dados.

A única exceção é a caixa de "Sugestões" no fim da página — se você escolher escrever e enviar uma sugestão, o nome (opcional) e a mensagem ficam guardados pra eu poder ler. É sempre uma ação explícita sua, nunca automática.

## Estrutura

```
app/
  page.js               # UI: busca de tipo de texto, upload, textarea, cards, sugestões
  api/analyze/route.js  # rota de servidor que chama Gemini ou Claude
  api/extract/route.js  # extrai texto de docx/pdf/txt/md
  api/sugestao/route.js # recebe as sugestões enviadas pela UI
  layout.js
  globals.css
lib/
  personas.js           # tipos de texto e personas + prompt
  config.js              # limites compartilhados entre cliente e servidor
  rate-limit.js          # limite diário de uso por IP
  redis.js                # conexão com o Redis (usado pelo rate limit e pelas sugestões)
  origin-guard.js         # bloqueia chamadas às rotas de API vindas de outro site
```

## Tecnologia

Next.js (App Router), React, e a API do Gemini ou da Anthropic pra gerar as reações. Rate limit diário via Redis (Upstash), quando conectado — sem ele, o app funciona normalmente, só sem o teto de uso.

## Licença

MIT — veja [LICENSE](./LICENSE). Contribuições são bem-vindas via pull request.
