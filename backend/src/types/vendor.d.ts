declare module 'epubjs' {
  interface EpubNode {
    nodeType: number;
    nodeName: string;
    textContent: string | null;
    childNodes: { forEach(callback: (node: EpubNode) => void): void };
  }

  interface EpubSpineItem {
    href?: string;
    label?: string;
    document?: EpubNode;
    load(): Promise<void>;
  }

  interface EpubBook {
    ready: Promise<void>;
    spine: {
      length: number;
      get(index: number): EpubSpineItem | undefined;
    };
    package: {
      metadata?: {
        title?: string;
        creator?: string | string[];
        language?: string;
        publisher?: string;
        description?: string;
        date?: string;
        identifier?: string;
        cover?: { href: string };
      };
    };
    archive: { createUrl(path: string): Promise<string> };
    destroy(): void;
  }

  const ePub: (path: string) => EpubBook;
  export default ePub;
}

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  interface PdfPage {
    getTextContent(): Promise<{ items: Array<{ str: string }> }>;
    getViewport(options: { scale: number }): { width: number; height: number };
    render(options: { canvasContext: object; viewport: { width: number; height: number } }): { promise: Promise<void> };
  }

  interface PdfDocument {
    numPages: number;
    getPage(page: number): Promise<PdfPage>;
    getMetadata(): Promise<{ info?: Record<string, string | undefined> }>;
  }

  const pdfjsLib: {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument(options: { data: Uint8Array }): { promise: Promise<PdfDocument> };
  };
  export = pdfjsLib;
}
