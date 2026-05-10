/**
 * Shared PDF text extractor (used by Import, Transactions, Debts).
 * Loads pdf.js v3.11.174 from CDN on demand.
 */
export async function extractPdfText(file: File): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      if ((window as any).pdfjsLib?.version && (window as any).pdfjsLib.version !== '3.11.174') {
        delete (window as any).pdfjsLib;
      }

      if (!(window as any).pdfjsLib) {
        await new Promise<void>((res, rej) => {
          const existing = document.querySelector('script[data-pdfjs]');
          if (existing) { res(); return; }
          const script = document.createElement('script');
          script.setAttribute('data-pdfjs', '3.11.174');
          script.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
          script.onload = () => res();
          script.onerror = () => rej(new Error('No se pudo cargar pdf.js'));
          document.head.appendChild(script);
        });
      }

      const pdfjs = (window as any).pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      resolve(text);
    } catch (e) {
      reject(e);
    }
  });
}
