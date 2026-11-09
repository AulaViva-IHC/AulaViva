// POST /api/login  { correo, password, volver? }  →  JSON
//   200 { ok, nombre, destino }
//   401 { error: 'credenciales', mensaje, restantes }
//   422 { error: 'validacion', campo, mensaje }
//   429 { error: 'bloqueo', segundos }
import type { APIRoute } from 'astro';
import { autenticar, destinoPorRol, rutaSegura } from '../../lib/auth';
import { iniciarSesion } from '../../lib/sesiones';
import { normalizarCorreo, validarCorreo, validarPassword } from '../../lib/validacion';

function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  let cuerpo: { correo?: unknown; password?: unknown; volver?: unknown };
  try {
    cuerpo = await request.json();
  } catch {
    return json({ error: 'validacion', mensaje: 'La solicitud no es válida.' }, 400);
  }

  const correo = typeof cuerpo.correo === 'string' ? cuerpo.correo : '';
  const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';

  const errorCorreo = validarCorreo(correo);
  if (errorCorreo) return json({ error: 'validacion', campo: 'correo', mensaje: errorCorreo }, 422);
  const errorPassword = validarPassword(password);
  if (errorPassword) return json({ error: 'validacion', campo: 'password', mensaje: errorPassword }, 422);

  let ip = 'desconocida';
  try {
    ip = clientAddress;
  } catch {
    // Algunos entornos no exponen la IP; el bloqueo funciona igual por correo.
  }

  const resultado = await autenticar(normalizarCorreo(correo), password, ip);

  if (resultado.tipo === 'bloqueado') {
    return json({ error: 'bloqueo', segundos: resultado.segundos }, 429);
  }
  if (resultado.tipo === 'incorrecto') {
    // Mismo mensaje exista o no el correo: nunca revelamos qué correos están registrados.
    return json(
      {
        error: 'credenciales',
        mensaje: 'Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña.',
        restantes: resultado.restantes,
      },
      401,
    );
  }

  await iniciarSesion(cookies, resultado.usuario);
  const volver = rutaSegura(cuerpo.volver);
  const destino =
    volver && !(volver.startsWith('/admin') && resultado.usuario.rol !== 'admin')
      ? volver
      : destinoPorRol(resultado.usuario);
  return json({ ok: true, nombre: resultado.usuario.nombre, destino });
};
