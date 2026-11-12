// GET /api/materiales/{clase}/guia       →  PDF de 1 página con la guía de la clase (pdf-lib)
// GET /api/materiales/{clase}/plantilla  →  TXT con la plantilla de práctica
// Materiales de muestra generados al vuelo mientras no se suben los archivos reales.
// Solo para estudiantes inscritos en el curso de la clase.
import type { APIRoute } from 'astro';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { avanceEnCurso, claseConCurso } from '../../../../lib/repositorio';
import { json } from '../../../../lib/respuestas';

const INDIGO = rgb(0x1b / 255, 0x17 / 255, 0x50 / 255);
const TINTA = rgb(0x17 / 255, 0x15 / 255, 0x3b / 255);
const GRIS = rgb(0x4b / 255, 0x4a / 255, 0x63 / 255);

/** Las fuentes estándar del PDF usan WinAnsi: se quitan los caracteres que no puede dibujar. */
const seguro = (t: string) => t.replace(/[«»]/g, '"').replace(/[^\x20-\xFF]/g, '');

function partirLineas(texto: string, max: number): string[] {
  const lineas: string[] = [];
  let linea = '';
  for (const palabra of texto.split(' ')) {
    if ((linea + ' ' + palabra).trim().length > max) {
      lineas.push(linea.trim());
      linea = palabra;
    } else linea += ' ' + palabra;
  }
  if (linea.trim()) lineas.push(linea.trim());
  return lineas;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return json({ error: 'sin-sesion' }, 401);
  const datos = await claseConCurso(Number(params.clase));
  if (!datos || !(await avanceEnCurso(usuario.id, datos.curso.id))) return json({ error: 'no-encontrado' }, 404);
  const { curso, modulo, clase } = datos;
  const archivo = `${curso.slug}-clase-${clase.codigo.replace('.', '-')}`;

  if (params.tipo === 'plantilla') {
    const texto = [
      `AulaViva · ${curso.titulo}`,
      `Módulo ${modulo.numero}, clase ${clase.codigo}: ${clase.titulo}`,
      '',
      'PLANTILLA DE PRÁCTICA',
      '',
      '1. ¿Qué quiero lograr con esta práctica?',
      '   ______________________________________________',
      '2. Pasos que seguí:',
      '   a) ____________________________________________',
      '   b) ____________________________________________',
      '   c) ____________________________________________',
      '3. ¿Qué me costó y cómo lo resolví?',
      '   ______________________________________________',
      '4. Una idea para aplicarlo en mi proyecto:',
      '   ______________________________________________',
      '',
    ].join('\r\n');
    return new Response('﻿' + texto, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${archivo}-plantilla.txt"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  if (params.tipo !== 'guia') return json({ error: 'no-encontrado' }, 404);

  const pdf = await PDFDocument.create();
  pdf.setTitle(seguro(`Guía: ${clase.titulo}`));
  pdf.setAuthor('AulaViva');
  pdf.setLanguage('es-PE');
  const pagina = pdf.addPage([595, 842]); // A4
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  pagina.drawRectangle({ x: 0, y: 762, width: 595, height: 80, color: INDIGO });
  pagina.drawText('AulaViva', { x: 48, y: 792, size: 22, font: negrita, color: rgb(1, 1, 1) });
  pagina.drawText(seguro(curso.titulo), { x: 48, y: 772, size: 11, font: normal, color: rgb(1, 1, 1) });
  pagina.drawText(seguro(`Módulo ${modulo.numero}, clase ${clase.codigo}`), { x: 48, y: 712, size: 12, font: normal, color: GRIS });
  let y = 684;
  for (const l of partirLineas(seguro(clase.titulo), 40)) {
    pagina.drawText(l, { x: 48, y, size: 24, font: negrita, color: TINTA });
    y -= 30;
  }
  y -= 10;
  const puntos = [
    'Mira el video completo con subtítulos; puedes pausarlo cuando quieras.',
    'Anota las dos ideas que te parezcan más útiles.',
    'Resuelve la plantilla de práctica de esta clase.',
    'Marca la clase como completada para guardar tu avance.',
    'Cuando completes el 100 % de las clases se habilita la evaluación final (nota mínima 14/20, 3 intentos).',
  ];
  pagina.drawText('Cómo aprovechar esta clase', { x: 48, y, size: 14, font: negrita, color: TINTA });
  y -= 26;
  puntos.forEach((p, i) => {
    for (const [k, l] of partirLineas(seguro(p), 80).entries()) {
      pagina.drawText(k === 0 ? `${i + 1}.  ${l}` : `     ${l}`, { x: 48, y, size: 11, font: normal, color: TINTA });
      y -= 18;
    }
    y -= 6;
  });
  pagina.drawText('Material de muestra del proyecto AulaViva (UNAMBA, 2026).', { x: 48, y: 48, size: 9, font: normal, color: GRIS });
  const bytes = await pdf.save();
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${archivo}-guia.pdf"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
};
