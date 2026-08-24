// Defesa em profundidade contra abuso via formulário/fetch de outro site
// (o rate limit por IP já limita o dano, isso aqui reduz a superfície).
//
// Requisições de navegador pra outra origem trazem o header Origin. Se o
// Origin existir e não bater com o host que está atendendo a requisição,
// rejeitamos — um site de terceiros não deveria estar chamando essas rotas
// diretamente. Requisições sem Origin (curl, scripts, chamadas
// servidor-a-servidor) passam — isso não é autenticação, é só reduzir abuso
// vindo de navegador em outro domínio.
export function origemPermitida(request) {
  const origem = request.headers.get("origin");
  if (!origem) return true;

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host) return true;

  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}
