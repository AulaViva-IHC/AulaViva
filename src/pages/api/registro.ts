// POST /api/registro  { nombre, correo, password, confirmacion, terminos, volver? }  →  JSON
//   201 { ok, nombre, destino }                       cuenta creada y sesión iniciada
//   409 { error: 'correo-existe', mensaje }           el correo ya tiene cuenta
//   422 { error: 'validacion', campo, mensaje }
//   429 { error: 'limite', segundos }                 demasiados correos existentes desde esta IP
//
// Excepción acordada a CLAUDE.md §10 (opción A): el registro sí dice que un correo ya existe,
// pero solo al enviar y con límite: 5 respuestas "ya existe" por IP cada 15 minutos.
import type { APIRoute } from 'astro';
import { hashPassword, rutaSegura } from '../../lib/auth';
import { iniciarSesion } from '../../lib/sesiones';
import {
  crearUsuario,
  buscarUsuarioPorCorreo,
  registrarRegistroRechazado,
  registrosRechazadosRecientes,
} from '../../lib/repositorio';
import {
  normalizarCorreo,
  normalizarNombre,
  validarConfirmacion,
  validarCorreo,
  validarNombre,
  validarPasswordNueva,
} from '../../lib/validacion';
import { ipDe, json, leerCuerpo, texto } from '../../lib/respuestas';

const MAX_RECHAZOS = 5;
const VENTANA_MS = 15 * 60 * 1000;

const MENSAJE_EXISTE = 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return json({ error: 'validacion', mensaje: 'La solicitud no es válida.' }, 400);

  const nombre = texto(cuerpo.nombre);
  const correo = texto(cuerpo.correo);
  const password = texto(cuerpo.password);
  const confirmacion = texto(cuerpo.confirmacion);

  const errores: [string, string | null][] = [
    ['nombre', validarNombre(nombre)],
    ['correo', validarCorreo(correo)],
    ['password', validarPasswordNueva(password)],
    ['confirmacion', validarConfirmacion(password, confirmacion)],
    ['terminos', cuerpo.terminos === true ? null : 'Marca la casilla para aceptar los términos.'],
  ];
  const primero = errores.find(([, error]) => error);
  if (primero) return json({ error: 'validacion', campo: primero[0], mensaje: primero[1] }, 422);

  const ip = ipDe(() => clientAddress);

  // Límite: quien prueba muchos correos existentes queda en pausa.
  const ahora = Date.now();
  const rechazos = await registrosRechazadosRecientes(ip, new Date(ahora - VENTANA_MS));
  if (rechazos.length >= MAX_RECHAZOS) {
    const libre = rechazos[rechazos.length - MAX_RECHAZOS].getTime() + VENTANA_MS;
    return json({ error: 'limite', segundos: Math.max(1, Math.ceil((libre - ahora) / 1000)) }, 429);
  }

  const correoLimpio = normalizarCorreo(correo);
  if (await buscarUsuarioPorCorreo(correoLimpio)) {
    await registrarRegistroRechazado(ip);
    return json({ error: 'correo-existe', campo: 'correo', mensaje: MENSAJE_EXISTE }, 409);
  }

  const usuario = await crearUsuario({
    nombre: normalizarNombre(nombre),
    correo: correoLimpio,
    passwordHash: await hashPassword(password),
    rol: 'estudiante',
  });
  // Dos registros simultáneos con el mismo correo: el segundo pierde.
  if (!usuario) return json({ error: 'correo-existe', campo: 'correo', mensaje: MENSAJE_EXISTE }, 409);

  await iniciarSesion(cookies, usuario);
  const volver = rutaSegura(cuerpo.volver);
  const destino = volver && !volver.startsWith('/admin') ? volver : '/inicio';
  return json({ ok: true, nombre: usuario.nombre, destino }, 201);
};
