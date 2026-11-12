// GET  /api/certificados  →  { certificados: [...] }  (Mis certificados; con el QR en SVG)
// POST /api/certificados  { curso, nombre }  →  201 { ok, codigo, destino }
//   Emite el certificado con el nombre confirmado en el modal "Confirma tu nombre".
//   El nombre debe ser el de la cuenta (si lo corrigió, ya está actualizado): así no sale uno viejo.
//   Si ya existe, devuelve el mismo código (no duplica). 403 si aún no aprueba.
//   Con ?simular (solo desarrollo) responde ok sin emitir.
// En desarrollo: GET ?simular=vacio (sin certificados) y ?simular=error (fallo).
import type { APIRoute } from 'astro';
import { certificadosDe, emitirCertificado } from '../../../lib/repositorio';
import { normalizarNombre } from '../../../lib/validacion';
import { json, leerCuerpo, simulacionDe, texto } from '../../../lib/respuestas';
import { aJSONCertificado } from '../../../lib/certificados';

export const GET: APIRoute = async ({ url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') return json({ error: 'sin-sesion' }, 401);
  const simular = simulacionDe(url);
  if (simular === 'error') return json({ error: 'no-disponible' }, 503);
  if (simular === 'vacio') return json({ certificados: [] });
  const lista = await certificadosDe(usuario.id);
  return json({ certificados: await Promise.all(lista.map((c) => aJSONCertificado(c, url.origin))) });
};

export const POST: APIRoute = async ({ request, url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario || usuario.rol !== 'estudiante') {
    return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión otra vez para emitir tu certificado.' }, 401);
  }
  const cuerpo = await leerCuerpo(request);
  const nombre = normalizarNombre(texto(cuerpo?.nombre));
  // Solo desarrollo (/estados): con ?simular no se emite nada; se va a la demostración.
  if (simulacionDe(url)) return json({ ok: true, codigo: 'K7Q2M9XPD4', destino: '/certificados?simular=ideal' }, 201);
  if (nombre !== usuario.nombre) {
    return json({ error: 'nombre', mensaje: 'Tu nombre cambió hace un momento. Revísalo y vuelve a confirmar.' }, 409);
  }
  const r = await emitirCertificado(usuario.id, Number(cuerpo?.curso), nombre);
  if (r.estado !== 'ok') {
    return json({ error: r.estado, mensaje: 'Aún no apruebas la evaluación de este curso: necesitas 14 de 20.' }, 403);
  }
  return json({ ok: true, codigo: r.certificado.codigo, destino: `/certificados?codigo=${r.certificado.codigo}` }, 201);
};
