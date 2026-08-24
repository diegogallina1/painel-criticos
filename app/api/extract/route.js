import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { verificarLimiteDiario } from "../../../lib/rate-limit";
import { origemPermitida } from "../../../lib/origin-guard";
import { MAX_TAMANHO_ARQUIVO, EXTENSOES_ACEITAS, MAX_CARACTERES } from "../../../lib/config";

export const runtime = "nodejs";

function extensaoDe(nomeArquivo) {
  const i = nomeArquivo.lastIndexOf(".");
  return i === -1 ? "" : nomeArquivo.slice(i).toLowerCase();
}

export async function POST(request) {
  if (!origemPermitida(request)) {
    return Response.json({ erro: "Origem não permitida." }, { status: 403 });
  }

  // Limite mais folgado que /api/analyze — extrair texto é bem mais barato
  // que chamar a IA, mas ainda vale proteger contra abuso de processamento
  // (PDFs grandes repetidos, por exemplo).
  const { limitado } = await verificarLimiteDiario(request, {
    prefixo: "extract",
    requisicoes: 20,
  });
  if (limitado) {
    return Response.json(
      { erro: "Limite diário de uploads atingido. Tenta de novo amanhã." },
      { status: 429 }
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ erro: "Não consegui ler o upload." }, { status: 400 });
  }

  const arquivo = formData.get("arquivo");
  if (!arquivo || typeof arquivo === "string") {
    return Response.json({ erro: "Nenhum arquivo recebido." }, { status: 400 });
  }

  const nome = arquivo.name || "arquivo";
  const ext = extensaoDe(nome);

  if (!EXTENSOES_ACEITAS.includes(ext)) {
    return Response.json(
      {
        erro: `Formato .${ext.replace(".", "")} não suportado. Envie ${EXTENSOES_ACEITAS.join(", ")}.`,
      },
      { status: 400 }
    );
  }

  if (arquivo.size > MAX_TAMANHO_ARQUIVO) {
    return Response.json(
      { erro: `Arquivo muito grande (limite de ${Math.round(MAX_TAMANHO_ARQUIVO / 1024 / 1024)} MB).` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  let texto = "";

  try {
    if (ext === ".docx") {
      const resultado = await mammoth.extractRawText({ buffer });
      texto = resultado.value;
    } else if (ext === ".pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const resultado = await extractText(pdf, { mergePages: true });
      texto = resultado.text;
    } else {
      // .txt ou .md
      texto = buffer.toString("utf-8");
    }
  } catch (e) {
    return Response.json(
      {
        erro: `Não consegui extrair texto de "${nome}". O arquivo pode estar corrompido, protegido por senha, ou ser um PDF escaneado sem OCR.`,
      },
      { status: 422 }
    );
  }

  texto = (texto || "").trim();

  if (!texto) {
    return Response.json(
      {
        erro: `"${nome}" não tem texto extraível (pode ser um PDF escaneado como imagem, sem OCR).`,
      },
      { status: 422 }
    );
  }

  // Protege a rota de análise (e o custo da chave de API) contra um arquivo
  // que extrai um volume de texto muito acima do limite de entrada — melhor
  // cortar aqui e avisar do que deixar o cliente tentar enviar algo enorme.
  let truncado = false;
  if (texto.length > MAX_CARACTERES) {
    texto = texto.slice(0, MAX_CARACTERES);
    truncado = true;
  }

  return Response.json({ texto, nomeArquivo: nome, truncado });
}
