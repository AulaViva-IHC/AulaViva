// PUT /api/perfil/nombre  { nombre }  →  { ok, nombre }
// "Corregir mi nombre" del modal "Confirma tu nombre": así saldrá en el certificado.
// Mismas reglas que el registro (validarNombre). 422 con el mensaje de qué corregir.
import type { APIRoute } from 'astro';
import { actualizarNombre } from '../../../lib/repositorio';
import { normalizarNombre, validarNombre } from '../../../lib/validacion';
import { json, leerCuerpo, simulacionDe, texto } from '../../../lib/respuestas';

export const PUT: APIRoute = async ({ request, url, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return json({ error: 'sin-sesion', mensaje: 'Tu sesión terminó. Inicia sesión otra vez.' }, 401);
  const cuerpo = await leerCuerpo(request);
  const nombre = normalizarNombre(texto(cuerpo?.nombre));
  const error = validarNombre(nombre);
  if (error) return json({ error: 'nombre', mensaje: error }, 422);
  // Solo desarrollo (/estados): con ?simular se valida pero no se guarda.
  if (simulacionDe(url)) return json({ ok: true, nombre });
  const actualizado = await actualizarNombre(usuario.id, nombre);
  return json({ ok: true, nombre: actualizado?.nombre ?? nombre });
};
