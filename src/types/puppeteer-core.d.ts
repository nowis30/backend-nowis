declare module 'puppeteer-core' {
  export interface LaunchOptions {
    args?: string[];
    defaultViewport?: {
      width?: number;
      height?: number;
      deviceScaleFactor?: number;
      isMobile?: boolean;
      hasTouch?: boolean;
      isLandscape?: boolean;
    } | null;
    executablePath?: string | null;
  headless?: boolean | 'new' | 'shell';
  }

  export interface PdfOptions {
    format?: string;
    printBackground?: boolean;
  }

  export interface SetContentOptions {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  }

  export interface Page {
    setContent(html: string, options?: SetContentOptions): Promise<void>;
    pdf(options?: PdfOptions): Promise<Uint8Array>;
  }

  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export interface PuppeteerCore {
    launch(options?: LaunchOptions): Promise<Browser>;
  }

  const puppeteer: PuppeteerCore;
  export default puppeteer;
}
