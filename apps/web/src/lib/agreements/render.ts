import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { LOGO_ASPECT, LOGO_PNG_BASE64 } from "@/lib/brand/logo";

// Template format (plain text):  "# Title", "## Heading", "- bullet", blank line = paragraph break,
// and {{variable}} placeholders. Anything else is body text.

const PAGE = { w: 612, h: 792, margin: 64 };
const WALNUT = rgb(0.129, 0.102, 0.086);
const MUTED = rgb(0.54, 0.48, 0.42);

export function fillTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, key: string) => {
    if (!(key in vars)) throw new Error(`Template variable "${key}" has no value`);
    return vars[key];
  });
}

// Standard PDF fonts only cover Latin-1 plus some punctuation; drop anything else rather than crash.
function safe(font: PDFFont, s: string) {
  let out = "";
  for (const ch of s.replace(/\r/g, "")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(font: PDFFont, text: string, size: number, width: number) {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export async function renderAgreementPdf(opts: {
  template: string;
  vars: Record<string, string>;
  footerId: string;
}): Promise<Uint8Array> {
  const filled = fillTemplate(opts.template, opts.vars);
  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));
  const width = PAGE.w - PAGE.margin * 2;

  let page = pdf.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - PAGE.margin - 34;

  const LOGO_H = 36;
  const brand = () => {
    page.drawImage(logo, { x: PAGE.margin, y: PAGE.h - 28 - LOGO_H, width: LOGO_H * LOGO_ASPECT, height: LOGO_H });
  };
  brand();

  const need = (h: number) => {
    if (y - h < PAGE.margin + 20) {
      page = pdf.addPage([PAGE.w, PAGE.h]);
      brand();
      y = PAGE.h - PAGE.margin - 34;
    }
  };

  const draw = (text: string, font: PDFFont, size: number, opts2: { indent?: number; color?: typeof WALNUT; after?: number } = {}) => {
    const indent = opts2.indent ?? 0;
    const lh = size * 1.45;
    for (const line of wrap(font, safe(font, text), size, width - indent)) {
      need(lh);
      y -= lh;
      page.drawText(line, { x: PAGE.margin + indent, y, size, font, color: opts2.color ?? WALNUT });
    }
    y -= opts2.after ?? 0;
  };

  for (const raw of filled.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      y -= 6;
    } else if (line.startsWith("## ")) {
      y -= 8;
      draw(line.slice(3), sansBold, 11, { after: 2 });
    } else if (line.startsWith("# ")) {
      draw(line.slice(2), serif, 24, { after: 8 });
    } else if (/^\*\*[^*].*\*\*$/.test(line)) {
      // An area name written by the scope builder: **Living Room**
      y -= 4;
      draw(line.slice(2, -2), sansBold, 10.5, { after: 1 });
    } else if (line.startsWith("- ")) {
      draw(`•  ${line.slice(2)}`, sans, 10.5, { indent: 10 });
    } else if (/^PLACEHOLDER WORDING/.test(line)) {
      draw(line, sansBold, 9, { color: rgb(0.7, 0.2, 0.1), after: 8 });
    } else {
      draw(line, sans, 10.5);
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${opts.footerId}  ·  Page ${i + 1} of ${pages.length}`, {
      x: PAGE.margin,
      y: 32,
      size: 8,
      font: sans,
      color: MUTED,
    });
  });
  return pdf.save();
}
