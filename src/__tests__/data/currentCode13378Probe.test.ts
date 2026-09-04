import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const PDF_URL = 'https://normas.gba.gob.ar/anexos/descargar/R08ZXyB1.pdf';
const TMP_DIR = path.resolve(process.cwd(), 'tmp/current-code-13378');

function contexts(text: string, needle: string, radius = 900) {
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  const out: string[] = [];
  let start = 0;
  while (out.length < 12) {
    const i = lower.indexOf(n, start);
    if (i < 0) break;
    out.push(text.slice(Math.max(0, i - radius), Math.min(text.length, i + n.length + radius)));
    start = i + n.length;
  }
  return out;
}

describe('Ordenanza 13.378/24 current-code evidence probe', () => {
  it('downloads the official provincial annex and extracts rural / gated-development rules when pdftotext is available', async () => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const pdfPath = path.join(TMP_DIR, 'ord-13378-2024.pdf');
    const txtPath = path.join(TMP_DIR, 'ord-13378-2024.txt');

    const r = await fetch(PDF_URL);
    expect(r.ok).toBe(true);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(pdfPath, buf);

    const pdftotext = spawnSync('pdftotext', ['-layout', pdfPath, txtPath], { encoding: 'utf8' });
    const available = pdftotext.status === 0 && fs.existsSync(txtPath);
    const text = available ? fs.readFileSync(txtPath, 'utf8') : '';

    const needles = [
      'Ministro Rivadavia',
      'Parque Rural',
      'club de campo',
      'clubes de campo',
      'barrio cerrado',
      'urbanización cerrada',
      'unidad privativa',
      'parcela mínima',
      'zona de recuperación',
      'uso específico',
      'cupo',
      '10%',
      '5%',
      '600 m2',
      '600 m²',
    ];

    const report = {
      source: PDF_URL,
      bytes: buf.length,
      pdftotextAvailable: available,
      pdftotextStatus: pdftotext.status,
      pdftotextStderr: pdftotext.stderr,
      textLength: text.length,
      hits: Object.fromEntries(needles.map((needle) => [needle, contexts(text, needle)])),
    };

    fs.writeFileSync(path.join(TMP_DIR, 'report.json'), JSON.stringify(report, null, 2));
    console.log('CURRENT_CODE_13378_PROBE_BEGIN');
    console.log(JSON.stringify(report, null, 2));
    console.log('CURRENT_CODE_13378_PROBE_END');

    expect(buf.length).toBeGreaterThan(1_000_000);
  }, 90_000);
});
