import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

export interface RenderPdfOptions {
  /** e.g. 'A4', 'Letter' */
  format?: 'A4' | 'Letter' | 'Legal';
  printBackground?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  /** Max time for page load + network idle (ms) */
  navigationTimeoutMs?: number;
}

const DEFAULT_OPTS: Required<Pick<RenderPdfOptions, 'format' | 'printBackground'>> & {
  margin: NonNullable<RenderPdfOptions['margin']>;
  navigationTimeoutMs: number;
} = {
  format: 'A4',
  printBackground: true,
  margin: { top: '0', right: '0', bottom: '0', left: '0' },
  navigationTimeoutMs: 30_000,
};

/**
 * Resolve Chromium/Chrome: env first, then common paths.
 */
export function resolveChromiumPath(): string | null {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    return fromEnv;
  }
  for (const p of [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
  ]) {
    if (existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Render a full HTML document string to PDF bytes. No domain logic — any valid HTML works.
 */
export async function renderHtmlToPdf(
  html: string,
  options: RenderPdfOptions = {},
): Promise<Buffer> {
  const executablePath = resolveChromiumPath();
  if (!executablePath) {
    throw new Error(
      'No Chromium/Chrome found. Set PUPPETEER_EXECUTABLE_PATH to the browser binary.',
    );
  }

  const o = { ...DEFAULT_OPTS, ...options, margin: { ...DEFAULT_OPTS.margin, ...options.margin } };

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: o.navigationTimeoutMs,
    });
    const pdf = await page.pdf({
      format: o.format,
      printBackground: o.printBackground,
      margin: o.margin,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
