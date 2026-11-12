// Utilidades del certificado (solo servidor): QR en SVG, fechas y el PDF.
// El QR lleva al enlace público de verificación: {origen}/verificar?codigo=XXXXXXXXXX
import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { CertificadoVista } from './repositorio';

export function enlaceVerificacion(origen: string, codigo: string): string {
  return `${origen}/verificar?codigo=${codigo}`;
}

/** "28 de octubre de 2026" (hora de Perú). */
export function fechaLarga(fecha: Date): string {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' }).format(fecha);
}

export async function qrSVG(texto: string): Promise<string> {
  return QRCode.toString(texto, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#17153B', light: '#FFFFFF' } });
}

/** Lo que recibe el navegador en Mis certificados. */
export async function aJSONCertificado(c: CertificadoVista, origen: string) {
  const enlace = enlaceVerificacion(origen, c.codigo);
  return {
    codigo: c.codigo,
    nombre: c.nombre,
    estado: c.estado,
    emitido: fechaLarga(c.emitidoEn),
    anulado: c.anuladoEn ? fechaLarga(c.anuladoEn) : null,
    curso: { titulo: c.curso.titulo, horas: c.curso.horas, color: c.curso.color, icono: c.curso.icono, slug: c.curso.slug },
    enlace,
    enlaceCorto: enlace.replace(/^https?:\/\//, '').replace(/\?.*$/, ''),
    qr: await qrSVG(enlace),
  };
}

const INDIGO = rgb(0x1b / 255, 0x17 / 255, 0x50 / 255);
const INDIGO3 = rgb(0x3b / 255, 0x34 / 255, 0xb0 / 255);
const TINTA = rgb(0x17 / 255, 0x15 / 255, 0x3b / 255);
const GRIS = rgb(0x4b / 255, 0x4a / 255, 0x63 / 255);
const AMARILLO = rgb(1, 0xd2 / 255, 0x3f / 255);
const PAPEL = rgb(0xfb / 255, 0xfa / 255, 0xf6 / 255);
/** Las fuentes estándar del PDF usan WinAnsi: se quitan los caracteres que no puede dibujar. */
const seguro = (t: string) => t.replace(/[^\x20-\xFF]/g, '');

/** PDF A4 horizontal con el mismo diseño que la vista de Mis certificados (09-certificados). */
export async function pdfCertificado(c: CertificadoVista, origen: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(seguro(`Certificado ${c.codigo} · ${c.curso.titulo}`));
  pdf.setAuthor('AulaViva');
  pdf.setSubject(seguro(`Certificado de aprobación de ${c.nombre}`));
  pdf.setLanguage('es-PE');
  const W = 842;
  const H = 595;
  const p = pdf.addPage([W, H]);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const centrado = (texto: string, y: number, size: number, font = normal, color = TINTA) => {
    const t = seguro(texto);
    p.drawText(t, { x: (W - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color });
  };

  // Marco índigo con detalle amarillo
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: INDIGO });
  p.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, color: PAPEL });
  p.drawRectangle({ x: W - 300, y: 0, width: 70, height: 18, color: AMARILLO });

  // Logo
  p.drawRectangle({ x: 60, y: H - 98, width: 36, height: 36, color: AMARILLO });
  p.drawText('A', { x: 70, y: H - 89, size: 22, font: negrita, color: TINTA });
  p.drawText('AulaViva', { x: 106, y: H - 88, size: 22, font: negrita, color: TINTA });
  const ceja = 'Certificado de aprobación';
  p.drawText(ceja, { x: W - 60 - negrita.widthOfTextAtSize(ceja, 13), y: H - 86, size: 13, font: negrita, color: INDIGO3 });

  centrado('Se otorga el presente certificado a', H - 190, 15, normal, GRIS);
  let tam = 38;
  while (negrita.widthOfTextAtSize(seguro(c.nombre), tam) > W - 160 && tam > 20) tam -= 2;
  centrado(c.nombre, H - 245, tam, negrita);
  centrado('por haber aprobado el curso', H - 285, 15, normal, GRIS);
  let tamCurso = 26;
  while (negrita.widthOfTextAtSize(seguro(c.curso.titulo), tamCurso) > W - 160 && tamCurso > 14) tamCurso -= 2;
  centrado(c.curso.titulo, H - 325, tamCurso, negrita, INDIGO3);
  centrado(`${c.curso.horas} horas académicas. Emitido el ${fechaLarga(c.emitidoEn)}.`, H - 358, 13, normal, GRIS);

  // Firma, sello y código + QR
  p.drawLine({ start: { x: 80, y: 120 }, end: { x: 290, y: 120 }, thickness: 1, color: GRIS });
  p.drawText('Dirección académica', { x: 80, y: 100, size: 11, font: normal, color: GRIS });
  p.drawCircle({ x: W / 2, y: 120, size: 44, color: AMARILLO, borderColor: TINTA, borderWidth: 1.5 });
  p.drawText('AV', { x: W / 2 - negrita.widthOfTextAtSize('AV', 22) / 2, y: 112, size: 22, font: negrita, color: TINTA });

  const qr = await QRCode.toDataURL(enlaceVerificacion(origen, c.codigo), { margin: 0, width: 240, color: { dark: '#17153B', light: '#FFFFFF' } });
  const png = await pdf.embedPng(qr);
  p.drawImage(png, { x: W - 60 - 96, y: 64, width: 96, height: 96 });
  const xTexto = W - 60 - 96 - 16;
  const der = (t: string, y: number, size: number, font = normal, color = GRIS) =>
    p.drawText(t, { x: xTexto - font.widthOfTextAtSize(t, size), y, size, font, color });
  der('Código', 132, 11);
  der(c.codigo, 112, 16, negrita, TINTA);
  der(enlaceVerificacion(origen, '').replace(/^https?:\/\//, '').replace(/\?.*$/, ''), 94, 10);

  if (c.estado === 'anulado') {
    p.drawRectangle({ x: 0, y: H / 2 - 30, width: W, height: 60, color: rgb(0x9b / 255, 0x1c / 255, 0x1c / 255), opacity: 0.85 });
    centrado('CERTIFICADO ANULADO', H / 2 - 10, 28, negrita, rgb(1, 1, 1));
  }
  return pdf.save();
}
