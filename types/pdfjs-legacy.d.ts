declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export function getDocument(options: {
    data?: Uint8Array;
    verbosity?: number;
    isEvalSupported?: boolean;
    disableFontFace?: boolean;
    useSystemFonts?: boolean;
  }): {
    promise: Promise<{
      numPages: number;
      getPage(pageNumber: number): Promise<{
        getTextContent(): Promise<{ items: { str?: string }[] }>;
      }>;
    }>;
  };
}
