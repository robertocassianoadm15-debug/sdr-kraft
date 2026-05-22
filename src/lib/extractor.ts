/**
 * Extrator universal de texto.
 * Recebe um Buffer + nome do arquivo, retorna texto bruto.
 * Suporta: CSV, XLSX, XLS, DOCX, PDF, TXT, JSON e qualquer texto.
 */

export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'docx' | 'pdf' | 'txt' | 'json' | 'unknown';

export function detectFormat(filename: string): FileFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, FileFormat> = {
    csv: 'csv', tsv: 'csv',
    xlsx: 'xlsx', xlsm: 'xlsx',
    xls: 'xls',
    docx: 'docx', doc: 'docx',
    pdf: 'pdf',
    txt: 'txt', md: 'txt', rtf: 'txt',
    json: 'json', jsonl: 'json'
  };
  return map[ext] ?? 'unknown';
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const fmt = detectFormat(filename);

  switch (fmt) {
    case 'csv':
      return buffer.toString('utf-8');

    case 'xlsx': {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const rows: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        rows.push(XLSX.utils.sheet_to_csv(ws));
      }
      return rows.join('\n');
    }

    case 'xls': {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const rows: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        rows.push(XLSX.utils.sheet_to_csv(ws));
      }
      return rows.join('\n');
    }

    case 'docx': {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    case 'pdf': {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      return data.text;
    }

    case 'json': {
      try {
        const obj = JSON.parse(buffer.toString('utf-8'));
        return JSON.stringify(obj, null, 2);
      } catch {
        return buffer.toString('utf-8');
      }
    }

    default:
      // TXT, MD, RTF, desconhecido — tenta como texto
      return buffer.toString('utf-8');
  }
}
