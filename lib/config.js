// Configuração compartilhada entre cliente e servidor.

// ~260.000 caracteres cobre um texto de uns 20 a 25 mil palavras em
// português (média de ~6 caracteres por palavra, incluindo espaço). Ajuste
// aqui se precisar de mais margem — vale conferir também o limite de corpo
// de requisição do Vercel se subir muito (padrão 4.5 MB; mesmo 260.000
// caracteres em UTF-8 fica bem abaixo disso, uns 300 a 500 KB).
export const MAX_CARACTERES = 260000;

// Tamanho máximo de arquivo aceito no upload (bytes), antes mesmo de tentar
// extrair o texto. 15 MB cobre PDFs com bastante formatação/imagem.
export const MAX_TAMANHO_ARQUIVO = 15 * 1024 * 1024;

export const EXTENSOES_ACEITAS = [".docx", ".pdf", ".txt", ".md"];
