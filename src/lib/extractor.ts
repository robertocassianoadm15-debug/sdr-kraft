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

function findHeaderRow(rows: any[][]): number {
  const keywords = [
    'empresa', 'company', 'nome', 'name', 'razao social', 'razão social',
    'email', 'e-mail', 'telefone', 'phone', 'cidade', 'city',
    'segmento', 'segment', 'categoria', 'category', 'cnpj'
  ];
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cells = rows[i]
      .filter((v: any) => v != null && v !== '')
      .map((v: any) => String(v).toLowerCase().trim());
    const matches = cells.filter((v: string) => keywords.some(k => v.includes(k)));
    if (matches.length >= 2) return i;
  }
  return 0;
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const fmt = detectFormat(filename);

  switch (fmt) {
    case 'csv':
      return buffer.toString('utf-8');

    case 'xlsx': {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheets: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][];
        const headerIdx = findHeaderRow(allRows);
        const trimmed = allRows.slice(headerIdx);
        const trimmedWs = XLSX.utils.aoa_to_sheet(trimmed);
        sheets.push(XLSX.utils.sheet_to_csv(trimmedWs));
      }
      return sheets.join('\n');
    }

    case 'xls': {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheets: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][];
        const headerIdx = findHeaderRow(allRows);
        const trimmed = allRows.slice(headerIdx);
        const trimmedWs = XLSX.utils.aoa_to_sheet(trimmed);
        sheets.push(XLSX.utils.sheet_to_csv(trimmedWs));
      }
      return sheets.join('\n');
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
