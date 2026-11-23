// Usuarios del administrador (ver el comentario de src/pages/admin/usuarios.astro).
import { ponerEstado, estaOcupado } from './boton';
import { iniciarProgreso, procesar, retroalimentar } from './multimodal';
import { $, anunciar, completarCarga, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla } from './util';
import { guardarEnUrl, iniciarResumen, normalizar, sufijos, tx } from './admin-util';

interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  registrado: string;
  cursos: number;
  aprobados: number;
  certificados: number;
  ultimoAcceso: string | null;
}

const { principal, simular } = sufijos();
const raiz = $<HTMLElement>('[data-usuarios]');
const contenido = $<HTMLElement>('[data-region="contenido"]', raiz);
const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
const error = $<HTMLElement>('[data-region="error"]', raiz);
const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
const filas = $<HTMLElement>('[data-filas]', raiz);
const caption = $<HTMLElement>('[data-caption]', raiz);
const buscar = $<HTMLInputElement>('#buscar-usuario', raiz);
const sinResultados = $<HTMLElement>('[data-sin-resultados]', raiz);
const limpiar = $<HTMLElement>('[data-limpiar]', raiz);
const anuncio = $<HTMLElement>('[data-anuncio]');

let usuarios: Usuario[] = [];
buscar.value = new URLSearchParams(window.location.search).get('q') ?? '';

function mostrar(region: 'contenido' | 'vacio' | 'error'): void {
  contenido.hidden = region !== 'contenido';
  vacio.hidden = region !== 'vacio';
  error.hidden = region !== 'error';
}

function pintar(): void {
  const q = normalizar(buscar.value);
  const visibles = usuarios.filter((u) => !q || normalizar(`${u.nombre} ${u.correo}`).includes(q));
  filas.replaceChildren(
    ...visibles.map((u) => {
      const f = plantilla('fila');
      $<HTMLElement>('[data-nombre]', f).textContent = u.nombre;
      $<HTMLElement>('[data-correo]', f).textContent = u.correo;
      $<HTMLElement>('[data-registro]', f).textContent = u.registrado;
      $<HTMLElement>('[data-cursos]', f).textContent = String(u.cursos);
      $<HTMLElement>('[data-aprobados]', f).textContent = String(u.aprobados);
      $<HTMLElement>('[data-certificados]', f).textContent = String(u.certificados);
      $<HTMLElement>('[data-acceso]', f).textContent = u.ultimoAcceso ?? tx('comun.nunca');
      return f;
    }),
  );
  caption.textContent = q
    ? tx('usuarios.resultados', { n: visibles.length, total: usuarios.length })
    : tx('usuarios.cargados', { n: usuarios.length });
  sinResultados.hidden = visibles.length > 0;
  $<HTMLElement>('[data-sin-resultados-texto]', sinResultados).textContent = tx('usuarios.sinResultados', { q: buscar.value.trim() });
  $<HTMLElement>('.tabla-adm__envoltura', raiz).hidden = visibles.length === 0;
}

async function cargar(reintento = false): Promise<boolean> {
  raiz.setAttribute('aria-busy', 'true');
  const progreso = reintento ? null : iniciarProgreso(raiz, { automatico: true, texto: tx('usuarios.cargando') });
  if (simular === 'cargando') return new Promise(() => {});
  const inicio = performance.now();
  try {
    const { respuesta, datos } = await pedirJSON<{ usuarios: Usuario[] }>(`/api/admin/usuarios${principal}`);
    if (respuesta.status === 401 || respuesta.status === 403) {
      window.location.assign('/login?volver=/admin/usuarios');
      return false;
    }
    if (!respuesta.ok) throw new Error('servidor');
    await completarCarga(inicio);
    if (reintento) {
      retroalimentar(reintentar, 'exito', tx('usuarios.cargados', { n: datos.usuarios.length }));
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(reintentar, 'normal');
    }
    usuarios = datos.usuarios;
    if (usuarios.length === 0) {
      mostrar('vacio');
      anunciar(anuncio, tx('usuarios.vacioAnuncio'));
      return true;
    }
    mostrar('contenido');
    pintar();
    anunciar(anuncio, caption.textContent ?? '');
    return true;
  } catch {
    await completarCarga(inicio);
    mostrar('error');
    if (reintento) retroalimentar(reintentar, 'error', tx('usuarios.errorSigue'));
    return false;
  } finally {
    progreso?.detener();
    raiz.setAttribute('aria-busy', 'false');
  }
}

let espera = 0;
buscar.addEventListener('input', () => {
  window.clearTimeout(espera);
  espera = window.setTimeout(() => {
    guardarEnUrl({ q: buscar.value.trim() });
    pintar();
    anunciar(anuncio, caption.textContent ?? '');
  }, 200);
});

function limpiarBusqueda(boton: HTMLElement | null): void {
  buscar.value = '';
  guardarEnUrl({ q: '' });
  pintar();
  retroalimentar(boton, 'cancelacion', tx('comun.busquedaQuitada'));
  buscar.focus();
}
buscar.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && buscar.value) {
    e.preventDefault();
    limpiarBusqueda(null);
  }
});
limpiar.addEventListener('click', () => limpiarBusqueda(limpiar));

reintentar.addEventListener('click', async () => {
  if (estaOcupado(reintentar)) return;
  procesar(reintentar);
  if (await cargar(true)) enfocar($<HTMLElement>('[data-titulo-pagina]'));
});

iniciarResumen((r) => ({ estudiantes: r.estudiantes, inscripciones: r.inscripciones, validos: r.certificados.validos }));
void cargar();
