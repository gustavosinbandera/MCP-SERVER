declare module 'html-to-text' {
  export interface HtmlToTextSelector {
    selector: string;
    format: string;
    options?: Record<string, unknown>;
  }
  export type FormatCallback = (
    elem: { type?: string; data?: string; children?: unknown[]; attribs?: Record<string, string> },
    walk: (children: unknown[], builder: unknown) => void,
    builder: { openBlock: (opts?: Record<string, unknown>) => void; closeBlock: (opts?: Record<string, unknown>) => void; addLiteral: (s: string) => void },
    formatOptions: Record<string, unknown>,
  ) => void;
  export interface HtmlToTextOptions {
    wordwrap?: number | null;
    preserveNewlines?: boolean;
    selectors?: HtmlToTextSelector[];
    baseElements?: { selectors?: string[]; returnDomByDefault?: boolean };
    formatters?: Record<string, FormatCallback>;
  }
  export function convert(html: string, options?: HtmlToTextOptions): string;
}
