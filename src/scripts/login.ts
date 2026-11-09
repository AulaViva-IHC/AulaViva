// Login en el navegador: correo recordado, validación al salir del campo,
// mostrar contraseña, Bloq Mayús, envío con bucle perceptual y bloqueo con
// cuenta regresiva. "Esta semana" vive en src/scripts/esta-semana.ts.
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { mostrarError, limpiarError, tieneError } from './campo';
import { validarCorreo, validarPassword, iniciales } from '../lib/validacion';
import {
  $,
  anunciar as anunciarEn,
  CARGA_MINIMA_MS,
  CLAVE_ULTIMO_CORREO,
  ESPERA_EXITO_MS,
  enfocar,
  esperar,
  guardarLocal as guardar,
  leerLocal as leer,
  simulacion,
} from './util';

const CLAVE_CORREO = CLAVE_ULTIMO_CORREO;
const CLAVE_BLOQUEO = 'aulaviva:bloqueoHasta';

const form = $<HTMLFormElement>('[data-form-login]');
const correo = $<HTMLInputElement>('#correo');
const password = $<HTMLInputElement>('#password');
const enviar = $<HTMLButtonElement>('[data-enviar]');
const anuncio = $<HTMLElement>('[data-anuncio]');
const titulo = $<HTMLElement>('[data-titulo]');
const avatar = $<HTMLElement>('[data-avatar]');
const sugerido = $<HTMLElement>('[data-sugerido]');
const otroCorreo = $<HTMLButtonElement>('[data-otro-correo]');
const ayudaCorreo = $<HTMLElement>('#correo-ayuda');
const verPassword = $<HTMLButtonElement>('[data-ver-password]');
const mayus = $<HTMLElement>('[data-mayus]');
const avisoRed = $<HTMLElement>('[data-aviso-red]');
const reintentar = $<HTMLButtonElement>('[data-reintentar]');
const avisoBloqueo = $<HTMLElement>('[data-aviso-bloqueo]');
const cuenta = $<HTMLElement>('[data-cuenta]');

const simular = simulacion();
const volver = form.dataset.volver ?? '';
const anunciar = (texto: string) => anunciarEn(anuncio, texto);

// ─── Correo recordado (valor por defecto inteligente) ─────────────────
const describeConAyuda = correo.getAttribute('aria-describedby') ?? '';

function modoRecordado(valor: string): void {
  correo.value = valor;
  correo.readOnly = true;
  avatar.textContent = iniciales(valor);
  avatar.hidden = false;
  sugerido.hidden = false;
  otroCorreo.hidden = false;
  ayudaCorreo.hidden = false;
  correo.setAttribute('aria-describedby', describeConAyuda);
}

function modoNuevo(): void {
  correo.readOnly = false;
  avatar.hidden = true;
  sugerido.hidden = true;
  otroCorreo.hidden = true;
  ayudaCorreo.hidden = true;
  correo.setAttribute('aria-describedby', describeConAyuda.replace('correo-ayuda', '').trim());
}

otroCorreo.addEventListener('click', () => {
  modoNuevo();
  correo.value = '';
  limpiarError(correo);
  correo.focus();
});

// ─── Validación al salir del campo ─────────────────────────────────
let correoTocado = false;

correo.addEventListener('input', () => {
  correoTocado = true;
  // Si ya mostraba un error, se corrige en vivo apenas el dato es válido.
  if (tieneError(correo) && !validarCorreo(correo.value)) limpiarError(correo);
});
correo.addEventListener('blur', () => {
  if (correo.readOnly || (!correoTocado && !correo.value)) return;
  const error = validarCorreo(correo.value);
  if (error) mostrarError(correo, error);
  else limpiarError(correo);
});
password.addEventListener('input', () => {
  if (tieneError(password)) limpiarError(password);
});

// ─── Mostrar u ocultar contraseña ───────────────────────────────────
verPassword.addEventListener('click', () => {
  const mostrar = password.type === 'password';
  password.type = mostrar ? 'text' : 'password';
  verPassword.setAttribute('aria-pressed', String(mostrar));
  verPassword.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

// ─── Aviso de Bloq Mayús ────────────────────────────────────────────
function revisarMayus(evento: KeyboardEvent | MouseEvent): void {
  if (typeof evento.getModifierState !== 'function') return;
  const activo = evento.getModifierState('CapsLock');
  const texto = activo ? 'Bloq Mayús está activado.' : '';
  if (mayus.textContent !== texto) mayus.textContent = texto;
}
password.addEventListener('keydown', revisarMayus);
password.addEventListener('keyup', revisarMayus);
password.addEventListener('mousedown', revisarMayus);
password.addEventListener('blur', () => (mayus.textContent = ''));

// ─── Estados del formulario ────────────────────────────────────────
function bloquearCampos(bloqueado: boolean): void {
  for (const el of [correo, password, verPassword, otroCorreo]) el.disabled = bloqueado;
}

function mostrarAvisoRed(tipo: 'sin-conexion' | 'servidor'): void {
  $<HTMLElement>('[data-aviso-red-titulo]').textContent =
    tipo === 'sin-conexion' ? 'Sin conexión a internet' : 'No pudimos conectar con AulaViva';
  $<HTMLElement>('[data-aviso-red-detalle]').textContent =
    tipo === 'sin-conexion'
      ? 'Revisa tu wifi o tus datos móviles e inténtalo de nuevo.'
      : 'El servicio no respondió. Espera unos segundos e inténtalo de nuevo.';
  avisoRed.hidden = false;
  avisoRed.classList.remove('anima-aparecer');
  void avisoRed.offsetWidth;
  avisoRed.classList.add('anima-aparecer');
  anunciar(
    tipo === 'sin-conexion'
      ? 'Sin conexión a internet. Revisa tu conexión y pulsa Reintentar.'
      : 'No pudimos conectar con AulaViva. Pulsa Reintentar.',
  );
}

function errorCredenciales(restantes?: number): void {
  const mensaje = document.createDocumentFragment();
  mensaje.append('Correo o contraseña incorrectos. Revisa los datos o ');
  const enlace = document.createElement('a');
  enlace.href = '/recuperar';
  enlace.textContent = 'recupera tu contraseña';
  mensaje.append(enlace, '.');
  if (restantes !== undefined && restantes > 0 && restantes <= 2) {
    mensaje.append(
      ` Te ${restantes === 1 ? 'queda 1 intento' : `quedan ${restantes} intentos`} antes de una pausa de 5 minutos.`,
    );
  }
  mostrarError(password, mensaje, { sacudir: true });
  // En /estados el error se muestra sin sonido (nunca suena sin una acción del usuario).
  if (simular) ponerEstado(enviar, 'error');
  else retroalimentar(enviar, 'error', 'No se pudo iniciar sesión: correo o contraseña incorrectos.');
}

// ─── Bloqueo con cuenta regresiva ───────────────────────────────────
let temporizador = 0;

function formatoCuenta(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function iniciarBloqueo(segundos: number): void {
  const hasta = Date.now() + segundos * 1000;
  guardar(CLAVE_BLOQUEO, String(hasta));
  avisoBloqueo.hidden = false;
  enviar.disabled = true;
  window.clearInterval(temporizador);

  const pintar = () => {
    const restan = Math.max(0, Math.ceil((hasta - Date.now()) / 1000));
    cuenta.textContent = formatoCuenta(restan);
    if (restan === 0) {
      window.clearInterval(temporizador);
      avisoBloqueo.hidden = true;
      enviar.disabled = false;
      guardar(CLAVE_BLOQUEO, null);
      anunciar('Ya puedes volver a intentarlo.');
    }
  };
  pintar();
  temporizador = window.setInterval(pintar, 250);
  anunciar(`Demasiados intentos fallidos. Vuelve a intentarlo en ${formatoCuenta(segundos)} minutos.`);
}

// ─── Envío ─────────────────────────────────────────────────────────
async function iniciarSesion(): Promise<void> {
  if (estaOcupado(enviar)) return; // ningún botón se envía dos veces

  const errorCorreo = validarCorreo(correo.value);
  const errorPassword = validarPassword(password.value);
  if (errorCorreo) mostrarError(correo, errorCorreo);
  if (errorPassword) mostrarError(password, errorPassword);
  if (errorCorreo || errorPassword) {
    retroalimentar(enviar, 'error', `Revisa ${errorCorreo ? 'el correo' : 'la contraseña'}: ${errorCorreo ?? errorPassword}`);
    (errorCorreo ? correo : password).focus();
    return;
  }

  avisoRed.hidden = true;
  limpiarError(correo);
  limpiarError(password);
  procesar(enviar);
  bloquearCampos(true);
  anunciar('Ingresando…');
  const inicio = performance.now();
  const terminarCarga = () => esperar(Math.max(0, CARGA_MINIMA_MS - (performance.now() - inicio)));

  let respuesta: Response;
  try {
    if (!navigator.onLine) throw new Error('sin conexión');
    respuesta = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: correo.value, password: password.value, volver }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    await terminarCarga();
    bloquearCampos(false);
    retroalimentar(enviar, 'error', ''); // el aviso de red ya se anuncia (assertive)
    mostrarAvisoRed(navigator.onLine ? 'servidor' : 'sin-conexion');
    return;
  }

  const datos = await respuesta.json().catch(() => ({}));
  await terminarCarga();

  if (respuesta.ok) {
    // Visual + earcon + vibración + "Sesión iniciada" en el mismo instante.
    retroalimentar(enviar, 'exito');
    guardar(CLAVE_CORREO, correo.value.trim().toLowerCase());
    guardar(CLAVE_BLOQUEO, null);
    window.setTimeout(() => window.location.assign(datos.destino ?? '/inicio'), ESPERA_EXITO_MS);
    return;
  }

  bloquearCampos(false);
  if (respuesta.status === 401) {
    password.value = '';
    errorCredenciales(datos.restantes);
    password.focus();
  } else if (respuesta.status === 429) {
    retroalimentar(enviar, 'error', ''); // iniciarBloqueo anuncia la cuenta regresiva
    iniciarBloqueo(Number(datos.segundos) || 300);
  } else if (respuesta.status === 422 && datos.campo) {
    const campo = datos.campo === 'correo' ? correo : password;
    mostrarError(campo, datos.mensaje, { sacudir: true });
    retroalimentar(enviar, 'error', datos.mensaje);
    campo.focus();
  } else {
    retroalimentar(enviar, 'error', '');
    mostrarAvisoRed('servidor');
  }
}

form.addEventListener('submit', (evento) => {
  evento.preventDefault();
  void iniciarSesion();
});

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  ponerEstado(reintentar, 'cargando');
  await esperar(CARGA_MINIMA_MS);
  ponerEstado(reintentar, 'normal');
  avisoRed.hidden = true;
  if (!validarCorreo(correo.value) && !validarPassword(password.value)) {
    void iniciarSesion();
  } else {
    enfocar(validarCorreo(correo.value) ? correo : password);
  }
});

// ─── Arranque ──────────────────────────────────────────────────────
const recordado = simular ? (simular === 'vacio' ? null : 'gbarreto@correo.com') : leer(CLAVE_CORREO);

if (recordado && !validarCorreo(recordado)) {
  modoRecordado(recordado);
  enfocar(password); // si ya sabemos el correo, el foco va a la contraseña
} else {
  modoNuevo();
  // Estado vacío (primera vez en este dispositivo)
  titulo.textContent = 'Te damos la bienvenida';
  enfocar(correo);
}

const bloqueoGuardado = Number(leer(CLAVE_BLOQUEO));
if (bloqueoGuardado > Date.now()) iniciarBloqueo(Math.ceil((bloqueoGuardado - Date.now()) / 1000));

// Estados forzados para /estados (solo desarrollo)
if (simular === 'cargando') {
  password.value = 'contraseña';
  procesar(enviar);
  bloquearCampos(true);
} else if (simular === 'error-red') {
  password.value = 'contraseña';
  mostrarAvisoRed('sin-conexion');
} else if (simular === 'error-credenciales') {
  errorCredenciales();
} else if (simular === 'bloqueo') {
  iniciarBloqueo(299);
}
