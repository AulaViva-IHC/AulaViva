// Crear cuenta en el navegador: validación al salir de cada campo, requisitos de la
// contraseña en vivo, medidor de seguridad, Bloq Mayús, mostrar/ocultar, botón que
// explica qué falta y envío con el bucle perceptual completo.
import { ponerEstado, estaOcupado } from './boton';
import { procesar, retroalimentar } from './multimodal';
import { mostrarError, limpiarError, sacudir, tieneError } from './campo';
import {
  REQUISITOS_PASSWORD,
  enumerar,
  fuerzaPassword,
  validarConfirmacion,
  validarCorreo,
  validarNombre,
  validarPasswordNueva,
} from '../lib/validacion';
import {
  $,
  $$,
  anunciar as anunciarEn,
  CARGA_MINIMA_MS,
  CLAVE_ULTIMO_CORREO,
  completarCarga,
  ESPERA_EXITO_MS,
  enfocar,
  esperar,
  guardarLocal,
  pedirJSON,
  simulacion,
} from './util';

const form = $<HTMLFormElement>('[data-form-registro]');
const nombre = $<HTMLInputElement>('#nombre');
const correo = $<HTMLInputElement>('#correo');
const password = $<HTMLInputElement>('#password');
const confirmacion = $<HTMLInputElement>('#confirmacion');
const terminos = $<HTMLInputElement>('#terminos');
const grupoTerminos = terminos.closest<HTMLElement>('[data-campo]')!;
const enviar = $<HTMLButtonElement>('[data-enviar]');
const faltan = $<HTMLElement>('[data-faltan]');
const medidor = $<HTMLElement>('[data-medidor]');
const medidorTexto = $<HTMLElement>('[data-medidor-texto]');
const anuncio = $<HTMLElement>('[data-anuncio]');
const avisoRed = $<HTMLElement>('[data-aviso-red]');
const reintentar = $<HTMLButtonElement>('[data-reintentar]');
const avisoLimite = $<HTMLElement>('[data-aviso-limite]');
const cuenta = $<HTMLElement>('[data-cuenta]');

const simular = simulacion();
const volver = form.dataset.volver ?? '';
const anunciar = (texto: string) => anunciarEn(anuncio, texto);

// ─── Reglas de cada campo ──────────────────────────────────────────
type Campo = HTMLInputElement;
const reglas = new Map<Campo, { validar: () => string | null; falta: string }>([
  [nombre, { validar: () => validarNombre(nombre.value), falta: 'tu nombre completo' }],
  [correo, { validar: () => validarCorreo(correo.value), falta: 'un correo válido' }],
  [password, { validar: () => validarPasswordNueva(password.value), falta: 'una contraseña segura' }],
  [confirmacion, { validar: () => validarConfirmacion(password.value, confirmacion.value), falta: 'confirmar la contraseña' }],
]);
const campos = [...reglas.keys()];
const tocados = new Set<Campo>();

// Errores que llegan del servidor (p. ej. "ese correo ya tiene cuenta") hasta que se cambie el valor.
const erroresServidor = new Map<Campo, { valor: string; mensaje: string | Node }>();

function errorDe(campo: Campo): string | null {
  return reglas.get(campo)!.validar();
}

function revisar(campo: Campo): void {
  const error = errorDe(campo);
  if (error) mostrarError(campo, error);
  else limpiarError(campo);
}

function mostrarErrorTerminos(): void {
  grupoTerminos.classList.add('is-error');
  terminos.setAttribute('aria-invalid', 'true');
  grupoTerminos.querySelector('[data-mensaje]')!.textContent = 'Marca la casilla para aceptar los términos.';
}
function limpiarErrorTerminos(): void {
  grupoTerminos.classList.remove('is-error');
  terminos.removeAttribute('aria-invalid');
  grupoTerminos.querySelector('[data-mensaje]')!.textContent = '';
}

// ─── El botón dice qué falta ───────────────────────────────────────
function pendientes(): string[] {
  const lista = campos
    .filter((c) => errorDe(c) || erroresServidor.get(c)?.valor === c.value)
    .map((c) => (!errorDe(c) && c === correo ? 'usar otro correo (ese ya tiene cuenta)' : reglas.get(c)!.falta));
  if (!terminos.checked) lista.push('aceptar los términos');
  return lista;
}

let bloqueadoHasta = 0;

function actualizarBoton(): void {
  if (enviar.dataset.estado === 'cargando' || enviar.dataset.estado === 'exito') return;
  const lista = pendientes();
  const listo = lista.length === 0 && bloqueadoHasta <= Date.now();
  enviar.setAttribute('aria-disabled', String(!listo));
  if (lista.length) {
    faltan.textContent = `Para crear tu cuenta falta: ${enumerar(lista)}.`;
    delete faltan.dataset.listo;
  } else if (bloqueadoHasta > Date.now()) {
    faltan.textContent = 'Espera a que termine la pausa para intentarlo de nuevo.';
    delete faltan.dataset.listo;
  } else {
    faltan.textContent = 'Todo listo para crear tu cuenta.';
    faltan.dataset.listo = '';
  }
}

// ─── Validación: al salir del campo; se corrige en vivo ─────────────
for (const campo of campos) {
  campo.addEventListener('blur', () => {
    if (campo.disabled) return;
    if (!tocados.has(campo) && !campo.value) return;
    tocados.add(campo);
    const delServidor = erroresServidor.get(campo);
    if (delServidor && delServidor.valor === campo.value) return; // sigue el aviso del servidor
    revisar(campo);
  });
  campo.addEventListener('input', () => {
    tocados.add(campo);
    erroresServidor.delete(campo);
    // Con error a la vista, se limpia apenas el dato es válido (no se grita mientras escribe).
    if (tieneError(campo) && !errorDe(campo)) limpiarError(campo);
    actualizarBoton();
  });
}

// La confirmación se vuelve a revisar cuando cambia la contraseña.
password.addEventListener('input', () => {
  pintarRequisitos();
  if (tocados.has(confirmacion) && confirmacion.value) {
    if (errorDe(confirmacion)) {
      if (tieneError(confirmacion)) mostrarError(confirmacion, errorDe(confirmacion)!);
    } else limpiarError(confirmacion);
  }
});
// En la confirmación, el acierto se muestra en vivo apenas coincide.
confirmacion.addEventListener('input', () => {
  if (confirmacion.value && confirmacion.value.length >= password.value.length && errorDe(confirmacion)) {
    mostrarError(confirmacion, errorDe(confirmacion)!);
  }
});

terminos.addEventListener('change', () => {
  if (terminos.checked) limpiarErrorTerminos();
  actualizarBoton();
});

// ─── Requisitos y medidor de seguridad ─────────────────────────────
const NIVELES = ['Seguridad: escribe tu contraseña', 'Seguridad: débil', 'Seguridad: media', 'Seguridad: fuerte', 'Seguridad: muy fuerte'];

function pintarRequisitos(): void {
  for (const r of REQUISITOS_PASSWORD) {
    const li = $<HTMLElement>(`[data-requisito="${r.id}"]`);
    const cumple = r.cumple(password.value);
    li.dataset.cumple = String(cumple);
    li.querySelector('[data-requisito-estado]')!.textContent = cumple ? ': cumplido' : ': pendiente';
  }
  const nivel = fuerzaPassword(password.value);
  medidor.dataset.nivel = String(nivel);
  medidorTexto.textContent = NIVELES[nivel];
}

// ─── Mostrar u ocultar contraseña ──────────────────────────────────
for (const boton of $$<HTMLButtonElement>('[data-ver]')) {
  const campo = $<HTMLInputElement>(`#${boton.dataset.ver}`);
  boton.addEventListener('click', () => {
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    boton.setAttribute('aria-pressed', String(mostrar));
    boton.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });
}

// ─── Bloq Mayús ────────────────────────────────────────────────────
for (const aviso of $$<HTMLElement>('[data-mayus]')) {
  const campo = $<HTMLInputElement>(`#${aviso.dataset.mayus}`);
  const revisarMayus = (e: KeyboardEvent | MouseEvent) => {
    if (typeof e.getModifierState !== 'function') return;
    const texto = e.getModifierState('CapsLock') ? 'Bloq Mayús está activado.' : '';
    if (aviso.textContent !== texto) aviso.textContent = texto;
  };
  campo.addEventListener('keydown', revisarMayus);
  campo.addEventListener('keyup', revisarMayus);
  campo.addEventListener('mousedown', revisarMayus);
  campo.addEventListener('blur', () => (aviso.textContent = ''));
}

// ─── Estados del formulario ────────────────────────────────────────
function bloquearCampos(bloqueado: boolean): void {
  for (const el of [...campos, terminos, ...$$<HTMLButtonElement>('[data-ver]')]) el.disabled = bloqueado;
}

function mostrarAvisoRed(tipo: 'sin-conexion' | 'servidor'): void {
  $<HTMLElement>('[data-aviso-red-titulo]').textContent =
    tipo === 'sin-conexion' ? 'Sin conexión a internet' : 'No pudimos conectar con AulaViva';
  $<HTMLElement>('[data-aviso-red-detalle]').textContent =
    tipo === 'sin-conexion'
      ? 'Revisa tu wifi o tus datos móviles. Tus datos siguen aquí.'
      : 'El servicio no respondió. Tus datos siguen aquí; inténtalo en unos segundos.';
  avisoRed.hidden = false;
  avisoRed.classList.remove('anima-aparecer');
  void avisoRed.offsetWidth;
  avisoRed.classList.add('anima-aparecer');
  anunciar(tipo === 'sin-conexion' ? 'Sin conexión a internet. Pulsa Reintentar.' : 'No pudimos conectar. Pulsa Reintentar.');
}

let temporizador = 0;
function iniciarLimite(segundos: number): void {
  bloqueadoHasta = Date.now() + segundos * 1000;
  avisoLimite.hidden = false;
  window.clearInterval(temporizador);
  const pintar = () => {
    const restan = Math.max(0, Math.ceil((bloqueadoHasta - Date.now()) / 1000));
    cuenta.textContent = `${Math.floor(restan / 60)}:${String(restan % 60).padStart(2, '0')}`;
    if (restan === 0) {
      window.clearInterval(temporizador);
      avisoLimite.hidden = true;
      anunciar('Ya puedes volver a intentarlo.');
      actualizarBoton();
    }
  };
  pintar();
  temporizador = window.setInterval(pintar, 250);
  actualizarBoton();
}

function errorCorreoExiste(): void {
  const mensaje = document.createDocumentFragment();
  mensaje.append('Ese correo ya tiene una cuenta. ');
  const login = document.createElement('a');
  login.href = '/login';
  login.textContent = 'Inicia sesión';
  // Al ir al login, ese correo queda sugerido.
  login.addEventListener('click', () => guardarLocal(CLAVE_ULTIMO_CORREO, correo.value.trim().toLowerCase()));
  const recuperar = document.createElement('a');
  recuperar.href = '/recuperar';
  recuperar.textContent = 'recupera tu contraseña';
  mensaje.append(login, ' o ', recuperar, '.');
  erroresServidor.set(correo, { valor: correo.value, mensaje });
  mostrarError(correo, mensaje, { sacudir: true });
}

// ─── Envío ─────────────────────────────────────────────────────────
async function crearCuenta(): Promise<void> {
  if (estaOcupado(enviar)) return; // ningún botón se envía dos veces

  if (enviar.getAttribute('aria-disabled') === 'true') {
    // Se explica qué falta en cada campo y el botón se sacude.
    for (const c of campos) {
      tocados.add(c);
      if (!erroresServidor.has(c)) revisar(c);
    }
    if (!terminos.checked) mostrarErrorTerminos();
    sacudir(faltan);
    actualizarBoton(); // actualiza el texto de "falta…"
    // Error multimodal: sacudida + earcon grave + vibración + qué falta (assertive).
    retroalimentar(enviar, 'error', faltan.textContent ?? '');
    actualizarBoton(); // vuelve a poner aria-disabled (ponerEstado lo quita)
    const primero = campos.find((c) => tieneError(c)) ?? (!terminos.checked ? terminos : null);
    primero?.focus();
    return;
  }

  avisoRed.hidden = true;
  procesar(enviar);
  bloquearCampos(true);
  anunciar('Creando tu cuenta…');
  const inicio = performance.now();

  let respuesta: Response;
  let datos: { destino?: string; campo?: string; mensaje?: string; segundos?: number };
  try {
    ({ respuesta, datos } = await pedirJSON<typeof datos>('/api/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: nombre.value,
        correo: correo.value,
        password: password.value,
        confirmacion: confirmacion.value,
        terminos: terminos.checked,
        volver,
      }),
    }));
  } catch (e) {
    await completarCarga(inicio);
    bloquearCampos(false);
    retroalimentar(enviar, 'error', ''); // el aviso de red ya se anuncia
    actualizarBoton();
    mostrarAvisoRed((e as Error).message === 'sin-conexion' ? 'sin-conexion' : 'servidor');
    return;
  }
  await completarCarga(inicio);

  if (respuesta.ok) {
    // Visual + earcon + vibración + "Cuenta creada" en el mismo instante.
    retroalimentar(enviar, 'exito');
    guardarLocal(CLAVE_ULTIMO_CORREO, correo.value.trim().toLowerCase()); // el login lo recordará
    window.setTimeout(() => window.location.assign(datos.destino ?? '/inicio'), ESPERA_EXITO_MS);
    return;
  }

  bloquearCampos(false);
  retroalimentar(
    enviar,
    'error',
    respuesta.status === 409
      ? 'Ese correo ya tiene una cuenta. Inicia sesión o usa otro correo.'
      : respuesta.status === 422
        ? (datos.mensaje ?? 'Revisa los datos marcados.')
        : '', // 429 y error del servidor se anuncian en su propio aviso
  );
  if (respuesta.status === 409) {
    errorCorreoExiste();
    correo.focus();
  } else if (respuesta.status === 429) {
    iniciarLimite(Number(datos.segundos) || 900);
    anunciar('Demasiados intentos. Espera unos minutos.');
  } else if (respuesta.status === 422 && datos.campo) {
    if (datos.campo === 'terminos') {
      mostrarErrorTerminos();
      terminos.focus();
    } else {
      const campo = $<HTMLInputElement>(`#${datos.campo}`);
      mostrarError(campo, datos.mensaje ?? 'Revisa este dato.', { sacudir: true });
      campo.focus();
    }
  } else {
    mostrarAvisoRed('servidor');
  }
  actualizarBoton();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void crearCuenta();
});

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  ponerEstado(reintentar, 'cargando');
  await esperar(CARGA_MINIMA_MS);
  ponerEstado(reintentar, 'normal');
  avisoRed.hidden = true;
  void crearCuenta();
});

// ─── Arranque ──────────────────────────────────────────────────────
function rellenar(): void {
  nombre.value = 'Ana Torres Quispe';
  correo.value = 'ana.torres@correo.com';
  password.value = 'Aulaviva2026';
  confirmacion.value = 'Aulaviva2026';
  terminos.checked = true;
  campos.forEach((c) => tocados.add(c));
}

if (simular === 'ideal' || simular === 'error-red') {
  rellenar();
} else if (simular === 'cargando') {
  rellenar();
} else if (simular === 'parcial') {
  nombre.value = 'Ana Torres Quispe';
}

pintarRequisitos();
actualizarBoton();

if (simular === 'cargando') {
  procesar(enviar);
  bloquearCampos(true);
} else if (simular === 'error-red') {
  mostrarAvisoRed('sin-conexion');
} else {
  enfocar(nombre);
}
