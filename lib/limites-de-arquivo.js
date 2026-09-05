// O limite de 15 MB do upload mede BYTES COMPRIMIDOS, e um .docx é só um zip
// DEFLATE: conteúdo repetitivo comprime mais de 1000x. Medido nas versões
// travadas do lockfile: um .docx de 286 KB cujo document.xml descomprime para
// 300 MB levou o RSS do Node a 929 MB; um de 495 KB levou a 1565 MB e matou o
// processo. Todos passavam por todas as checagens, porque a checagem era do
// tamanho errado.
//
// Aqui o tamanho descomprimido é lido do diretório central do zip ANTES de
// entregar o arquivo ao parser. É metadado, não descompressão: custa
// microssegundos e não aloca nada.

export const MAX_DESCOMPRIMIDO = 40 * 1024 * 1024; // 40 MB
export const MAX_PAGINAS_PDF = 400;
export const MS_LIMITE_PARSE = 15_000;

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_CD = 0x02014b50;

/**
 * Soma o tamanho descomprimido declarado no diretório central do zip.
 * Devolve { total, maiorEntrada, entradas } ou lança se o zip não for legível.
 */
export function tamanhoDescomprimidoDoZip(buffer) {
  // O EOCD fica no fim, possivelmente atrás de um comentário de até 65535 bytes.
  const limite = Math.min(buffer.length, 65535 + 22);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= buffer.length - limite; i--) {
    if (i >= 0 && buffer.readUInt32LE(i) === ASSINATURA_EOCD) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error("não é um zip válido (sem EOCD)");

  const totalEntradas = buffer.readUInt16LE(eocd + 10);
  let pos = buffer.readUInt32LE(eocd + 16);

  let total = 0;
  let maiorEntrada = 0;
  let entradas = 0;

  for (let i = 0; i < totalEntradas; i++) {
    if (pos + 46 > buffer.length) throw new Error("diretório central truncado");
    if (buffer.readUInt32LE(pos) !== ASSINATURA_CD) break;

    const descomprimido = buffer.readUInt32LE(pos + 24);
    // 0xFFFFFFFF significa ZIP64, com o tamanho real no campo extra. Um .docx
    // que precisa de ZIP64 já passou de 4 GB descomprimidos: recusa direto.
    if (descomprimido === 0xffffffff) throw new Error("zip64 não é aceito");

    total += descomprimido;
    if (descomprimido > maiorEntrada) maiorEntrada = descomprimido;
    entradas++;

    const nome = buffer.readUInt16LE(pos + 28);
    const extra = buffer.readUInt16LE(pos + 30);
    const comentario = buffer.readUInt16LE(pos + 32);
    pos += 46 + nome + extra + comentario;
  }

  return { total, maiorEntrada, entradas };
}

/** Corre a promessa contra um relógio de parede. */
export function comPrazo(promessa, ms, mensagem) {
  let id;
  const relogio = new Promise((_, rejeitar) => {
    id = setTimeout(() => rejeitar(new Error(mensagem)), ms);
  });
  return Promise.race([promessa, relogio]).finally(() => clearTimeout(id));
}
