// GET /api/verificar?codigo=XXXXXXXXXX  →  verificación PÚBLICA (sin sesión), CLAUDE.md §8:
//   { estado: "valido" | "anulado", codigo, nombre, curso, emitido, anulado }  (solo nombre, curso y fechas)
//   { estado: "no-encontrado", codigo }
//   422 { mensaje } si el código no tiene el formato (10 caracteres, sin O, 0, I, 1).
// En desarrollo: ?simular=error responde con fallo (estado de error con "Reintentar").
import type { APIRoute } from 'astro';
import { verificarCertificado } from '../../lib/repositorio';
import { fechaLarga } from '../../lib/certificados';
import { normalizarCodigo, validarCodigo } from '../../lib/codigo';
import { json, simulacionDe } from '../../lib/respuestas';

export const GET: APIRoute = async ({ url }) => {
  if (simulacionDe(url) === 'error') return json({ error: 'no-disponible' }, 503);
  const codigo = normalizarCodigo(url.searchParams.get('codigo') ?? '').slice(0, 40);
  const error = validarCodigo(codigo);
  if (error) return json({ error: 'formato', mensaje: error }, 422);
  const r = await verificarCertificado(codigo);
  if (r.estado === 'no-encontrado') return json(r);
  return json({
    estado: r.estado,
    codigo: r.codigo,
    nombre: r.nombre,
    curso: r.curso,
    emitido: fechaLarga(r.emitidoEn),
    anulado: r.anuladoEn ? fechaLarga(r.anuladoEn) : null,
  });
};
