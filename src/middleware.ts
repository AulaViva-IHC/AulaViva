// Se ejecuta antes de cada página o API: lee la sesión y protege las rutas.
import { defineMiddleware } from 'astro:middleware';
import { usuarioDeCookie } from './lib/sesiones';
import { destinoPorRol } from './lib/auth';
import { buscarUsuarioPorId } from './lib/repositorio';

// Páginas que exigen sesión (las APIs privadas revisan la sesión por su cuenta y responden 401).
const PRIVADAS = ['/inicio', '/mis-cursos', '/certificados', '/clase', '/evaluacion', '/resultado', '/notificaciones', '/admin'];
// Con sesión no tiene sentido verlas: se va directo al inicio del rol.
const SOLO_SIN_SESION = ['/login', '/registro'];
// Solo en desarrollo: /estados muestra el Inicio dentro de iframes sin iniciar sesión.
const SIMULABLES = ['/inicio', '/api/inicio', '/api/esta-semana'];

function empiezaCon(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(prefijo + '/');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search, searchParams } = context.url;
  const simulando = import.meta.env.DEV && searchParams.has('simular');

  // /estados es solo para desarrollo.
  if (empiezaCon(pathname, '/estados') && !import.meta.env.DEV) {
    return new Response('No encontrado', { status: 404 });
  }

  let usuario = await usuarioDeCookie(context.cookies);
  // En desarrollo, ?simular=… sin sesión de estudiante muestra el Inicio con el estudiante de prueba.
  if (simulando && SIMULABLES.includes(pathname) && usuario?.rol !== 'estudiante') {
    usuario = await buscarUsuarioPorId(1);
  }
  context.locals.usuario = usuario;

  if (SOLO_SIN_SESION.includes(pathname) && usuario && !simulando) {
    return context.redirect(destinoPorRol(usuario));
  }

  if (PRIVADAS.some((p) => empiezaCon(pathname, p))) {
    if (!usuario) {
      return context.redirect(`/login?volver=${encodeURIComponent(pathname + search)}`);
    }
    // Un estudiante que entra a /admin vuelve a /inicio.
    if (empiezaCon(pathname, '/admin') && usuario.rol !== 'admin') {
      return context.redirect('/inicio');
    }
    const respuesta = await next();
    // Las páginas privadas no deben quedar en la caché del navegador.
    respuesta.headers.set('Cache-Control', 'no-store');
    return respuesta;
  }

  return next();
});
