declare module 'pdf-parse' {
  function pdfParse(buffer: Buffer, options?: object): Promise<{ text: string; numpages: number }>;
  export = pdfParse;
}
