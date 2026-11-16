// Act. 16 · Búsqueda de cursos por voz o con teclado, con cambio automático de entrada.
//
// Un solo estado compartido ({ texto, categoria }) que pintan el campo, los botones de categoría
// y la lista. Voz, teclado, clic y táctil solo envían "órdenes" a ese estado: cambiar de modo
// nunca borra nada.
//
// Reglas de cambio (aviso visible + aria-live; en el cambio automático el foco va al campo con el
// cursor al final y suena la firma de Error, §5.9):
//   1 sin SpeechRecognition · 2 not-allowed · 3 audio-capture · 4 network → teclado automático
//   5 confianza < 0,6 en 2 resultados seguidos → teclado; el texto dudoso queda en el campo
//   6 no-speech 2 veces seguidas → solo sugerir escribir
//   7 / 9 pulsar «Hablar» o decir «usar voz» → voz: «Te escucho.»
//   8 3 o más borrados en < 10 s → sugerir voz una vez por sesión (Esc la cierra, sin robar el foco)
// Conflicto: categorías distintas de voz y clic con < 3 s de diferencia → no se aplica ninguna y
// se pregunta con una tarjeta alertdialog (botones, teclas 1/2, voz; Esc cierra sin cambiar nada).
// Firmas: orden aceptada = Éxito · escuchando = Progreso · fallo o conflicto = Error · cancelar/Esc = Cancelación.
import { ponerEstado } from './boton';
import { iniciarProgreso, retroalimentar, type Progreso } from './multimodal';
import { $, $$, enfocar, ESPERA_EXITO_MS, esperar, pedirJSON, plantilla, simulacion } from './util';
import { normalizarBusqueda } from '../lib/validacion';

// ─── Tipos ─────────────────────────────────────────────────────────
type Categoria = '' | 'tecnologia' | 'diseno' | 'negocios' | 'habilidades-blandas';
type Modo = 'voz' | 'teclado';
type EstadoVoz = 'lista' | 'escuchando' | 'no-disponible';
type Origen = 'voz' | 'clic' | 'teclado';

interface CursoResumen {
  slug: string;
  titulo: string;
  categoria: string;
  nivel: 'basico' | 'intermedio' | 'avanzado';
  horas: number;
  buscable: string;
}
interface Avance {
  slug: string;
  porcentaje: number;
  aprobado: boolean;
}
interface Orden {
  origen: Origen;
  tipo: 'categoria';
  valor: Categoria;
  hora: number;
  /** Categoría que había antes de aplicarla (para deshacerla si choca con otra). */
  anterior: Categoria;
  resuelta: boolean;
}

// Web Speech API: tipos mínimos (no todos los navegadores ni versiones de lib.dom los traen).
interface AlternativaVoz {
  transcript: string;
  confidence: number;
}
interface EventoResultado {
  resultIndex: number;
  results: ArrayLike<ArrayLike<AlternativaVoz> & { isFinal: boolean }>;
}
interface Reconocedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: EventoResultado) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type ConstructorReconocedor = new () => Reconocedor;

// ─── Constantes ────────────────────────────────────────────────────
const CATEGORIAS: Record<Exclude<Categoria, ''>, string> = {
  tecnologia: 'Tecnología',
  diseno: 'Diseño',
  negocios: 'Negocios',
  'habilidades-blandas': 'Habilidades blandas',
};
const NIVEL = { basico: 'Nivel básico', intermedio: 'Nivel intermedio', avanzado: 'Nivel avanzado' };
const CONFIANZA_MINIMA = 0.6;
const VENTANA_CONFLICTO_MS = 3000;
const VENTANA_BORRADOS_MS = 10_000;
const CLAVE_SUGERENCIA_VOZ = 'aulaviva:a16-sugerencia-voz';

const MENSAJES = {
  'sin-soporte': 'Tu navegador no permite dictar. Escribe aquí.',
  'not-allowed': 'No hay permiso de micrófono. Sigue escribiendo; lo que dijiste se guardó.',
  'audio-capture': 'No encontramos un micrófono. Escribe aquí.',
  network: 'Sin conexión para dictar. Escribe aquí.',
  confianza: 'Hay mucho ruido y no te entendí bien. Corrige con el teclado.',
  'no-speech': 'No te escuchamos. ¿Prefieres escribir?',
  voz: 'Te escucho.',
} as const;
const REGLA = {
  'sin-soporte': 'Regla 1 · sin dictado',
  'not-allowed': 'Regla 2 · not-allowed',
  'audio-capture': 'Regla 3 · audio-capture',
  network: 'Regla 4 · network',
  confianza: 'Regla 5 · confianza baja',
  'no-speech': 'Regla 6 · no-speech',
} as const;
type Fallo = keyof typeof REGLA;

const nombreCategoria = (c: Categoria) => (c ? CATEGORIAS[c] : 'Todas');

const raiz = document.querySelector<HTMLElement>('[data-a16]');
if (raiz) iniciar(raiz);

function iniciar(raiz: HTMLElement): void {
  const simular = simulacion();

  // ─── Elementos ────────────────────────────────────────────────────
  const form = $<HTMLFormElement>('[data-form]', raiz);
  const campo = $<HTMLInputElement>('[data-busqueda]', raiz);
  const voz = $<HTMLElement>('[data-voz]', raiz);
  const hablar = $<HTMLButtonElement>('[data-hablar]', raiz);
  const hablarTexto = $<HTMLElement>('[data-hablar-texto]', raiz);
  const hablarEstado = $<HTMLElement>('[data-hablar-estado]', raiz);
  const modoTexto = $<HTMLElement>('[data-modo-texto]', raiz);
  const semaforos = $$<HTMLElement>('[data-semaforo]', raiz);
  const aviso = $<HTMLElement>('[data-aviso]', raiz);
  const avisoTexto = $<HTMLElement>('[data-aviso-texto]', raiz);
  const sugerenciaEscribir = $<HTMLElement>('[data-sugerencia="escribir"]', raiz);
  const sugerenciaVoz = $<HTMLElement>('[data-sugerencia="voz"]', raiz);
  const oido = $<HTMLElement>('[data-oido]', raiz);
  const oidoTexto = $<HTMLElement>('[data-oido-texto]', raiz);
  const orden = $<HTMLElement>('[data-orden]', raiz);
  const ordenTexto = $<HTMLElement>('[data-orden-texto]', raiz);
  const botonesCategoria = $$<HTMLButtonElement>('[data-categoria]', raiz);
  const mostrarBoton = $<HTMLButtonElement>('[data-mostrar]', raiz);
  const anuncio = $<HTMLElement>('[data-anuncio]', raiz);

  const conflicto = $<HTMLElement>('[data-conflicto]', raiz);
  const conflictoTitulo = $<HTMLElement>('[data-conflicto-titulo]', raiz);
  const opciones = $$<HTMLButtonElement>('[data-opcion]', raiz);

  const resultadosTitulo = $<HTMLElement>('[data-resultados-titulo]', raiz);
  const resumen = $<HTMLElement>('[data-resumen]', raiz);
  const lista = $<HTMLUListElement>('[data-lista]', raiz);
  const vacio = $<HTMLElement>('[data-region="vacio"]', raiz);
  const error = $<HTMLElement>('[data-region="error"]', raiz);
  const reintentar = $<HTMLElement>('[data-accion="reintentar"]', error);
  const limpiar = $<HTMLButtonElement>('[data-limpiar]', vacio);
  const avanceError = $<HTMLElement>('[data-avance-error]', raiz);
  const reconectar = $<HTMLElement>('[data-accion="reconectar"]', avanceError);

  // ─── Estado compartido ────────────────────────────────────────────
  const estado = { texto: '', categoria: '' as Categoria, modo: 'teclado' as Modo };
  let cursos: CursoResumen[] = [];
  let avance = new Map<string, Avance>();
  let cargado = false;

  // ─── Avisos ───────────────────────────────────────────────────────
  /** Anuncio polite propio (sugerencias): no lleva firma. */
  function decir(texto: string): void {
    anuncio.textContent = anuncio.textContent === texto ? `${texto} ` : texto;
  }

  function mostrarAviso(texto: string): void {
    avisoTexto.textContent = texto;
    aviso.hidden = false;
  }

  /** Orden aceptada: visual (check + texto) + firma de Éxito + vibración + aria-live, en el mismo instante. */
  function confirmar(texto: string, boton: HTMLElement | null = null): void {
    ordenTexto.textContent = texto;
    orden.hidden = false;
    retroalimentar(boton, 'exito', texto);
  }

  function cancelar(texto: string): void {
    orden.hidden = true;
    retroalimentar(null, 'cancelacion', texto);
  }

  // ─── Pintar ───────────────────────────────────────────────────────
  function pintarFormulario(): void {
    if (campo.value !== estado.texto) campo.value = estado.texto;
    for (const b of botonesCategoria) b.setAttribute('aria-pressed', String(b.dataset.categoria === estado.categoria));
    modoTexto.textContent = estado.modo === 'voz' ? 'Voz' : 'Teclado';
  }

  function filtrados(): CursoResumen[] {
    const palabras = normalizarBusqueda(estado.texto).split(/\s+/).filter((p) => p.length > 1);
    return cursos.filter(
      (c) => (!estado.categoria || c.categoria === estado.categoria) && palabras.every((p) => c.buscable.includes(p)),
    );
  }

  function textoResumen(n: number): string {
    const cuantos = n === 1 ? '1 curso' : `${n} cursos`;
    const en = estado.categoria ? ` en ${nombreCategoria(estado.categoria)}` : '';
    const para = estado.texto.trim() ? ` para «${estado.texto.trim()}»` : '';
    return `${cuantos}${en}${para}`;
  }

  function pintarResultados(): void {
    pintarFormulario();
    if (!cargado) return;
    const encontrados = filtrados();
    resumen.textContent = textoResumen(encontrados.length);
    lista.replaceChildren(...encontrados.map(tarjeta));
    lista.hidden = encontrados.length === 0;
    vacio.hidden = encontrados.length > 0;
  }

  function tarjeta(c: CursoResumen): DocumentFragment {
    const t = plantilla('curso', raiz);
    const enlace = $<HTMLAnchorElement>('[data-enlace]', t);
    enlace.href = `/cursos/${c.slug}`;
    enlace.textContent = c.titulo;
    $<HTMLElement>('[data-categoria-texto]', t).textContent = nombreCategoria(c.categoria as Categoria);
    $<HTMLElement>('[data-nivel]', t).textContent = NIVEL[c.nivel];
    $<HTMLElement>('[data-horas]', t).textContent = `${c.horas} horas`;
    const a = avance.get(c.slug);
    if (a) {
      const caja = $<HTMLElement>('[data-avance]', t);
      const badge = plantilla(a.aprobado ? 'avance-aprobado' : 'avance-inscrito', raiz);
      $<HTMLElement>('[data-badge-texto]', badge).textContent = a.aprobado ? 'Aprobado' : `Inscrito · ${a.porcentaje} %`;
      caja.append(badge);
      caja.hidden = false;
    }
    return t;
  }

  // ─── Registro de eventos (panel ?prueba=1) ────────────────────────
  const registro: { hora: string; regla: string; mensaje: string; conservados: string }[] = [];
  const cuerpoRegistro = raiz.querySelector<HTMLElement>('[data-registro]');

  /** ¿Siguen en pantalla los datos que había (o los esperados, si la regla los cambia a propósito)? */
  function datosConservados(antes: { texto: string; categoria: Categoria }): boolean {
    const pulsado = botonesCategoria.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.categoria ?? '';
    return (
      campo.value === estado.texto &&
      estado.texto === antes.texto &&
      estado.categoria === antes.categoria &&
      pulsado === estado.categoria
    );
  }

  function registrar(regla: string, mensaje: string, conservados: boolean | null): void {
    const hora = new Date().toLocaleTimeString('es-PE', { hour12: false });
    const fila = { hora, regla, mensaje, conservados: conservados === null ? '—' : conservados ? 'Sí' : 'No' };
    registro.push(fila);
    if (!cuerpoRegistro) return;
    cuerpoRegistro.querySelector('[data-registro-vacio]')?.remove();
    const tr = document.createElement('tr');
    for (const valor of [fila.hora, fila.regla, fila.mensaje]) {
      const td = document.createElement('td');
      td.textContent = valor;
      tr.append(td);
    }
    const td = document.createElement('td');
    if (conservados === null) td.textContent = '—';
    else {
      const marca = document.createElement('span');
      marca.className = `conservado conservado--${conservados ? 'si' : 'no'}`;
      marca.append(plantilla(conservados ? 'ic-check' : 'ic-alerta', raiz), fila.conservados);
      td.append(marca);
    }
    tr.append(td);
    cuerpoRegistro.append(tr);
  }

  // ─── Órdenes y conflicto voz vs clic ──────────────────────────────
  const ordenes: Orden[] = [];
  let conflictoActivo: { voz: Categoria; clic: Categoria; volverA: HTMLElement | null } | null = null;

  /**
   * Cambia la categoría. Si llega otra de distinto origen (voz ↔ clic) hace menos de 3 s:
   * distintas → se deshace la primera y se pregunta; iguales → se aplica una sola vez.
   */
  function ordenCategoria(valor: Categoria, origen: Origen, boton: HTMLElement | null = null): void {
    const ahora = Date.now();
    let otra: Orden | undefined;
    for (let i = ordenes.length - 1; i >= 0; i--) {
      const o = ordenes[i];
      if (ahora - o.hora >= VENTANA_CONFLICTO_MS) break;
      if (!o.resuelta && o.origen !== origen && (o.origen === 'voz' || origen === 'voz')) {
        otra = o;
        break;
      }
    }
    const nueva: Orden = { origen, tipo: 'categoria', valor, hora: ahora, anterior: estado.categoria, resuelta: false };
    ordenes.push(nueva);
    if (ordenes.length > 30) ordenes.shift();

    if (otra) {
      otra.resuelta = nueva.resuelta = true;
      if (otra.valor === valor) {
        registrar('Conflicto voz / clic', `Coinciden (${nombreCategoria(valor)}): se aplicó una sola vez.`, true);
        return; // ya está aplicada
      }
      // No se aplica ninguna: vuelve la categoría que había antes de la primera.
      const antes = { texto: estado.texto, categoria: otra.anterior };
      estado.categoria = otra.anterior;
      pintarResultados();
      const [porVoz, porClic] = origen === 'voz' ? [valor, otra.valor] : [otra.valor, valor];
      abrirConflicto(porVoz, porClic);
      registrar(
        'Conflicto voz / clic',
        `Dijiste ${nombreCategoria(porVoz)} y tocaste ${nombreCategoria(porClic)}: no se aplicó ninguna.`,
        datosConservados(antes),
      );
      return;
    }

    if (estado.categoria === valor) {
      confirmar(`Categoría: ${nombreCategoria(valor)} (ya estaba elegida).`, boton);
      return;
    }
    estado.categoria = valor;
    pintarResultados();
    if (valor) confirmar(`Categoría: ${nombreCategoria(valor)}. ${textoResumen(filtrados().length)}.`, boton);
    else cancelar(`Filtro quitado. ${textoResumen(filtrados().length)}.`);
  }

  function abrirConflicto(porVoz: Categoria, porClic: Categoria): void {
    const activo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    conflictoActivo = { voz: porVoz, clic: porClic, volverA: conflictoActivo?.volverA ?? activo };
    const x = nombreCategoria(porVoz);
    const y = nombreCategoria(porClic);
    conflictoTitulo.textContent = `Dijiste ${x} y tocaste ${y}. ¿Cuál quieres?`;
    $<HTMLElement>('[data-opcion-texto]', opciones[0]).textContent = x;
    $<HTMLElement>('[data-opcion-texto]', opciones[1]).textContent = y;
    conflicto.hidden = false;
    orden.hidden = true;
    // Firma de Error + aviso assertive; el foco va al primer botón (sin límite de tiempo).
    retroalimentar(null, 'error', `Dijiste ${x} y tocaste ${y}. ¿Cuál quieres? Pulsa 1 para ${x} o 2 para ${y}. Esc cierra sin cambiar nada.`);
    enfocar(opciones[0]);
    if (estado.modo === 'voz' && !escuchando) escuchar(); // también se puede responder por voz
  }

  function cerrarConflicto(eleccion: Categoria | null): void {
    if (!conflictoActivo) return;
    const { volverA } = conflictoActivo;
    conflictoActivo = null;
    conflicto.hidden = true;
    if (eleccion === null) {
      cancelar('Cerrado sin cambiar nada. La categoría sigue igual.');
      registrar('Conflicto voz / clic', 'Esc: se cerró sin cambiar nada.', null);
    } else {
      estado.categoria = eleccion;
      pintarResultados();
      confirmar(`Categoría: ${nombreCategoria(eleccion)}. ${textoResumen(filtrados().length)}.`);
      registrar('Conflicto voz / clic', `Elegiste ${nombreCategoria(eleccion)}.`, null);
    }
    // Devolver el foco a donde estaba (o al campo, si ese control ya no existe).
    enfocar(volverA && volverA.isConnected && !volverA.closest('[hidden]') ? volverA : campo);
  }

  opciones.forEach((b, i) =>
    b.addEventListener('click', () => {
      if (conflictoActivo) cerrarConflicto(i === 0 ? conflictoActivo.voz : conflictoActivo.clic);
    }),
  );

  // ─── Modo y voz ───────────────────────────────────────────────────
  const Reconocimiento: ConstructorReconocedor | undefined =
    (window as unknown as { SpeechRecognition?: ConstructorReconocedor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: ConstructorReconocedor }).webkitSpeechRecognition;
  let reconocedor: Reconocedor | null = null;
  let escuchando = false;
  let seguirEscuchando = false; // en modo voz se vuelve a escuchar tras cada frase
  let progreso: Progreso | null = null;
  let bajas = 0; // resultados seguidos con confianza < 0,6
  let silencios = 0; // no-speech seguidos

  function pintarVoz(e: EstadoVoz): void {
    voz.dataset.voz = e;
    for (const s of semaforos) s.hidden = s.dataset.semaforo !== e;
    hablarTexto.textContent = { lista: 'Hablar', escuchando: 'Dejar de escuchar', 'no-disponible': 'Hablar' }[e];
    hablarEstado.textContent = {
      lista: 'Lista para escuchar.',
      escuchando: 'Escuchando… di una orden.',
      'no-disponible': 'La voz no está disponible ahora.',
    }[e];
  }

  function cambiarModo(modo: Modo): void {
    estado.modo = modo;
    pintarFormulario();
  }

  /** Cambio AUTOMÁTICO al teclado: nada se borra, aviso visible + Error + foco al final del campo. */
  function cambiarATeclado(fallo: Fallo, mensaje: string, esperado = { texto: estado.texto, categoria: estado.categoria }): void {
    detenerEscucha(true);
    cambiarModo('teclado');
    sugerenciaEscribir.hidden = true;
    oido.hidden = true;
    orden.hidden = true;
    // Confianza baja: el micrófono funciona (la voz sigue lista). Los demás fallos: no disponible.
    pintarVoz(fallo === 'confianza' && Reconocimiento ? 'lista' : 'no-disponible');
    mostrarAviso(mensaje);
    retroalimentar(null, 'error', mensaje);
    enfocarCampoAlFinal();
    registrar(REGLA[fallo], mensaje, datosConservados(esperado));
  }

  function enfocarCampoAlFinal(): void {
    enfocar(campo);
    const fin = campo.value.length;
    try {
      campo.setSelectionRange(fin, fin);
    } catch {
      /* algunos tipos de campo no admiten selección */
    }
  }

  /** Reglas 7 y 9: pasar a voz («Te escucho.»). */
  function pasarAVoz(origen: string): void {
    if (!Reconocimiento) {
      cambiarATeclado('sin-soporte', MENSAJES['sin-soporte']);
      return;
    }
    aviso.hidden = true;
    sugerenciaVoz.hidden = true;
    sugerenciaEscribir.hidden = true;
    bajas = 0;
    silencios = 0;
    cambiarModo('voz');
    decir(MENSAJES.voz);
    registrar(origen, MENSAJES.voz, null);
    escuchar();
  }

  function escuchar(): void {
    if (!Reconocimiento || escuchando) return;
    if (!reconocedor) {
      reconocedor = new Reconocimiento();
      reconocedor.lang = 'es-PE';
      reconocedor.continuous = false;
      reconocedor.interimResults = true;
      reconocedor.maxAlternatives = 1;
      reconocedor.onresult = alOir;
      reconocedor.onerror = (e) => alFallar(e.error);
      reconocedor.onend = alTerminar;
    }
    try {
      reconocedor.start();
    } catch {
      return; // ya estaba arrancando
    }
    escuchando = true;
    seguirEscuchando = true;
    pintarVoz('escuchando');
    // Escuchando = firma de Progreso (gotas + señal con reloj + anuncio cada 25 %).
    progreso = iniciarProgreso(voz, { texto: 'Escuchando' });
  }

  /** Detiene la escucha. `abortar`: corta sin esperar el último resultado. */
  function detenerEscucha(abortar = false): void {
    seguirEscuchando = false;
    progreso?.detener('silencio');
    progreso = null;
    if (escuchando && reconocedor) {
      try {
        if (abortar) reconocedor.abort();
        else reconocedor.stop();
      } catch {
        /* ya estaba detenido */
      }
    }
    escuchando = false;
    oido.hidden = true;
    if (voz.dataset.voz === 'escuchando') pintarVoz('lista');
  }

  function alOir(e: EventoResultado): void {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const alt = r[0];
      if (!r.isFinal) {
        oidoTexto.textContent = alt.transcript;
        oido.hidden = false;
        continue;
      }
      oido.hidden = true;
      procesarFrase(alt.transcript, alt.confidence);
    }
  }

  function alFallar(codigo: string): void {
    if (codigo === 'aborted') return;
    if (codigo === 'no-speech') return noSeEscucho();
    if (codigo === 'not-allowed' || codigo === 'service-not-allowed') return cambiarATeclado('not-allowed', MENSAJES['not-allowed']);
    if (codigo === 'audio-capture') return cambiarATeclado('audio-capture', MENSAJES['audio-capture']);
    if (codigo === 'network') return cambiarATeclado('network', MENSAJES.network);
    // language-not-supported, bad-grammar…: el dictado no sirve aquí.
    cambiarATeclado('sin-soporte', MENSAJES['sin-soporte']);
  }

  function alTerminar(): void {
    escuchando = false;
    progreso?.detener('silencio');
    progreso = null;
    oido.hidden = true;
    if (voz.dataset.voz === 'escuchando') pintarVoz('lista');
    // En modo voz se vuelve a escuchar tras cada frase (la tarea se completa entera hablando).
    if (seguirEscuchando && estado.modo === 'voz') window.setTimeout(() => estado.modo === 'voz' && seguirEscuchando && escuchar(), 450);
  }

  /** Regla 6: dos no-speech seguidos → solo sugerir escribir (el modo no cambia). */
  function noSeEscucho(): void {
    silencios++;
    if (silencios < 2) {
      decir('No te escuché. Habla un poco más fuerte.');
      registrar(REGLA['no-speech'], `No se escuchó nada (${silencios} de 2).`, null);
      return;
    }
    silencios = 0;
    seguirEscuchando = false; // no se insiste: la persona decide
    sugerenciaEscribir.hidden = false;
    decir(MENSAJES['no-speech']);
    registrar(REGLA['no-speech'], MENSAJES['no-speech'], datosConservados({ texto: estado.texto, categoria: estado.categoria }));
  }

  // ─── Comandos ─────────────────────────────────────────────────────
  /** Minúsculas, sin tildes ni signos: «¡Categoría Diseño!» → «categoria diseno». */
  const normalizar = (t: string) =>
    normalizarBusqueda(t)
      .replace(/[¿?¡!.,;:«»"']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  function categoriaDe(t: string): Categoria | null {
    if (/^(todas?|todos?|ninguna)$/.test(t)) return '';
    if (t.startsWith('tecnolog')) return 'tecnologia';
    if (t.startsWith('disen')) return 'diseno';
    if (t.startsWith('negocio')) return 'negocios';
    if (t.includes('habilidad') || t.includes('blanda')) return 'habilidades-blandas';
    return null;
  }

  /** Quita la primera palabra (el comando) conservando tildes y mayúsculas de lo dictado. */
  const sinPrimeraPalabra = (t: string) =>
    t.trim().replace(/^\S+\s*/, '').replace(/[.,;:!?¡¿]+$/g, '').trim().slice(0, 80);

  function procesarFrase(frase: string, confianza: number): void {
    const t = normalizar(frase);
    if (!t) return;
    const textoDicho = /^buscar\b/.test(t) ? sinPrimeraPalabra(frase) : frase.trim().replace(/[.]+$/, '').slice(0, 80);
    if (estado.modo !== 'voz') cambiarModo('voz');

    // Regla 5. confidence 0 = el navegador no la informa (no cuenta como baja).
    if (confianza > 0 && confianza < CONFIANZA_MINIMA) {
      bajas++;
      // El texto dudoso queda en el campo para corregirlo.
      estado.texto = textoDicho;
      pintarResultados();
      const esperado = { texto: estado.texto, categoria: estado.categoria };
      if (bajas >= 2) {
        bajas = 0;
        cambiarATeclado('confianza', MENSAJES.confianza, esperado);
      } else {
        decir(`No estoy seguro de haber entendido «${textoDicho}». Lo dejé en el campo; repite o corrígelo.`);
        registrar(REGLA.confianza, `Confianza ${confianza.toFixed(2).replace('.', ',')} (1 de 2). Texto dudoso en el campo.`, datosConservados(esperado));
      }
      return;
    }
    bajas = 0;
    silencios = 0;
    sugerenciaEscribir.hidden = true;

    // Conflicto abierto: «uno», «dos» o el nombre de una de las dos categorías.
    if (conflictoActivo) {
      const c = categoriaDe(t.replace(/^categoria /, ''));
      if (/^(1|uno|primer[oa]?)$/.test(t) || (c !== null && c === conflictoActivo.voz)) return cerrarConflicto(conflictoActivo.voz);
      if (/^(2|dos|segund[oa])$/.test(t) || (c !== null && c === conflictoActivo.clic)) return cerrarConflicto(conflictoActivo.clic);
      if (/^(cancelar|cerrar|ninguna?)$/.test(t)) return cerrarConflicto(null);
      retroalimentar(null, 'error', 'Di «uno» o «dos», o pulsa 1 o 2.');
      return;
    }

    if (/^usar (el )?teclado$/.test(t) || t === 'teclado') {
      detenerEscucha();
      cambiarModo('teclado');
      aviso.hidden = true;
      confirmar('Modo teclado. Escribe aquí.');
      enfocarCampoAlFinal();
      registrar('Orden «usar teclado»', 'Modo teclado. Escribe aquí.', datosConservados({ texto: estado.texto, categoria: estado.categoria }));
      return;
    }
    if (/^usar (la )?voz$/.test(t)) return pasarAVoz('Regla 9 · «usar voz»');
    if (/^quitar (el )?filtros?$/.test(t)) return ordenCategoria('', 'voz');
    if (/^borrar( todo| busqueda| la busqueda)?$/.test(t)) return borrarBusqueda();
    if (/^(mostrar|ver) (los )?resultados?$/.test(t)) return void mostrarResultados(null);
    if (/^categoria\b/.test(t)) {
      const c = categoriaDe(t.replace(/^categoria ?/, ''));
      if (c === null) {
        retroalimentar(null, 'error', 'No conozco esa categoría. Di tecnología, diseño, negocios o habilidades blandas.');
        return;
      }
      return ordenCategoria(c, 'voz');
    }
    if (/^buscar\b/.test(t)) {
      if (!textoDicho) {
        retroalimentar(null, 'error', 'Di qué buscar, por ejemplo: buscar diseño.');
        return;
      }
      return ordenBuscar(textoDicho);
    }
    // Sin comando: lo dicho se toma como búsqueda.
    ordenBuscar(textoDicho, ' Para filtrar di, por ejemplo, «categoría diseño».');
  }

  function ordenBuscar(texto: string, extra = ''): void {
    estado.texto = texto;
    pintarResultados();
    confirmar(`Buscando «${texto}». ${textoResumen(filtrados().length)}.${extra}`);
  }

  function borrarBusqueda(): void {
    if (!estado.texto) {
      cancelar('La búsqueda ya estaba vacía.');
      return;
    }
    const antes = estado.texto;
    estado.texto = '';
    pintarResultados();
    cancelar(`Borré «${antes}». ${textoResumen(filtrados().length)}.`);
  }

  async function mostrarResultados(boton: HTMLButtonElement | null): Promise<void> {
    if (!cargado) {
      const texto = 'Los cursos aún no cargan. Espera un momento o pulsa «Reintentar».';
      if (boton) retroalimentar(boton, 'error', texto);
      else retroalimentar(null, 'error', texto);
      return;
    }
    const texto = `${textoResumen(filtrados().length)}.`;
    resultadosTitulo.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    enfocar(resultadosTitulo);
    confirmar(texto, boton);
    if (boton) {
      await esperar(ESPERA_EXITO_MS);
      ponerEstado(boton, 'normal');
    }
  }

  // ─── Teclado, clic y táctil ───────────────────────────────────────
  campo.addEventListener('input', () => {
    estado.texto = campo.value.slice(0, 80);
    orden.hidden = true;
    pintarResultados();
  });

  // Regla 8: 3 o más borrados en menos de 10 s → sugerir voz (una vez por sesión, sin robar el foco).
  const borrados: number[] = [];
  let sugeridaEnMemoria = false;
  const yaSugerida = () => {
    try {
      return sessionStorage.getItem(CLAVE_SUGERENCIA_VOZ) === '1' || sugeridaEnMemoria;
    } catch {
      return sugeridaEnMemoria;
    }
  };
  campo.addEventListener('keydown', (e) => {
    if (e.repeat || (e.key !== 'Backspace' && e.key !== 'Delete')) return;
    const ahora = Date.now();
    borrados.push(ahora);
    while (borrados.length && ahora - borrados[0] > VENTANA_BORRADOS_MS) borrados.shift();
    if (borrados.length < 3 || yaSugerida() || estado.modo === 'voz' || !Reconocimiento) return;
    sugeridaEnMemoria = true;
    try {
      sessionStorage.setItem(CLAVE_SUGERENCIA_VOZ, '1');
    } catch {
      /* sin almacenamiento: vale para esta visita */
    }
    sugerenciaVoz.hidden = false;
    decir('¿Te cuesta escribir? Puedes dictar tu búsqueda con el botón Usar voz. Esc cierra esta sugerencia.');
    registrar('Regla 8 · borrados', `${borrados.length} borrados en menos de 10 s: se sugirió la voz.`, null);
  });

  for (const b of botonesCategoria) {
    b.addEventListener('click', () => ordenCategoria((b.dataset.categoria ?? '') as Categoria, 'clic', b));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    // «usar voz» escrito también vale (regla 9).
    if (/^usar (la )?voz$/.test(normalizar(campo.value))) {
      estado.texto = '';
      pintarResultados();
      pasarAVoz('Regla 9 · «usar voz»');
      return;
    }
    void mostrarResultados(mostrarBoton);
  });

  hablar.addEventListener('click', () => {
    if (escuchando) {
      detenerEscucha();
      cancelar('Dejé de escuchar. Lo que dijiste se conserva.');
      return;
    }
    pasarAVoz('Regla 7 · botón «Hablar»');
  });

  $<HTMLElement>('[data-ir-teclado]', raiz).addEventListener('click', () => {
    sugerenciaEscribir.hidden = true;
    detenerEscucha();
    cambiarModo('teclado');
    confirmar('Modo teclado. Escribe aquí.');
    enfocarCampoAlFinal();
  });
  $<HTMLElement>('[data-ir-voz]', raiz).addEventListener('click', () => pasarAVoz('Regla 7 · sugerencia «Usar voz»'));

  function cerrarSugerencia(s: HTMLElement): void {
    const teniaFoco = s.contains(document.activeElement);
    s.hidden = true;
    cancelar('Sugerencia cerrada.');
    if (teniaFoco) enfocarCampoAlFinal();
  }
  for (const b of $$<HTMLElement>('[data-cerrar-sugerencia]', raiz)) {
    b.addEventListener('click', () => {
      const s = b.closest<HTMLElement>('[data-sugerencia]')!;
      // «Seguir con voz» vuelve a escuchar.
      cerrarSugerencia(s);
      if (s === sugerenciaEscribir && estado.modo === 'voz') escuchar();
    });
  }

  // Teclas globales: 1 / 2 en el conflicto; Esc cierra lo más reciente.
  document.addEventListener('keydown', (e) => {
    if (conflictoActivo && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const escribiendo = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === '1' || e.key === '2') && !escribiendo) {
        e.preventDefault();
        cerrarConflicto(e.key === '1' ? conflictoActivo.voz : conflictoActivo.clic);
        return;
      }
    }
    if (e.key !== 'Escape') return;
    if (conflictoActivo) {
      e.preventDefault();
      cerrarConflicto(null);
    } else if (!sugerenciaVoz.hidden) {
      cerrarSugerencia(sugerenciaVoz);
    } else if (!sugerenciaEscribir.hidden) {
      cerrarSugerencia(sugerenciaEscribir);
    } else if (escuchando) {
      detenerEscucha();
      cancelar('Dejé de escuchar. Lo que dijiste se conserva.');
    }
  });

  limpiar.addEventListener('click', () => {
    estado.texto = '';
    estado.categoria = '';
    pintarResultados();
    cancelar(`Filtro y búsqueda quitados. ${textoResumen(filtrados().length)}.`);
    enfocar(campo);
  });

  // ─── Carga de cursos (5 estados) ──────────────────────────────────
  const sufijo = (valor: string) => (valor ? `?simular=${valor}` : '');

  async function cargarCursos(boton: HTMLElement | null = null): Promise<void> {
    error.hidden = true;
    vacio.hidden = true;
    lista.hidden = false;
    lista.setAttribute('aria-busy', 'true');
    resumen.textContent = 'Cargando cursos…';
    if (simular === 'cargando') return; // /estados: se queda en el skeleton
    const carga = boton ? null : iniciarProgreso(lista, { automatico: true, texto: 'Cargando cursos' });
    try {
      const { respuesta, datos } = await pedirJSON<{ cursos: CursoResumen[] }>(`/api/cursos${sufijo(simular === 'error' ? 'error' : '')}`);
      if (!respuesta.ok) throw new Error('sin cursos');
      cursos = datos.cursos;
      cargado = true;
      lista.removeAttribute('aria-busy');
      pintarResultados();
      carga?.detener('exito');
      if (boton) {
        retroalimentar(boton, 'exito', `Cursos cargados. ${textoResumen(filtrados().length)}.`);
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(boton, 'normal');
      }
      void cargarAvance();
    } catch {
      carga?.detener('silencio');
      lista.hidden = true;
      lista.removeAttribute('aria-busy');
      error.hidden = false;
      resumen.textContent = 'Sin resultados por ahora.';
      if (boton) retroalimentar(boton, 'error', 'Los cursos siguen sin cargar. Revisa tu conexión y vuelve a intentarlo.');
    }
  }

  async function cargarAvance(boton: HTMLElement | null = null): Promise<void> {
    try {
      const { respuesta, datos } = await pedirJSON<{ avance: Avance[] }>(`/api/mi-avance${sufijo(simular === 'parcial' ? 'parcial' : '')}`);
      if (!respuesta.ok) throw new Error('sin avance');
      avance = new Map(datos.avance.map((a) => [a.slug, a]));
      avanceError.hidden = true;
      pintarResultados();
      if (boton) retroalimentar(boton, 'exito', 'Tu avance ya se ve en cada curso.');
    } catch {
      avanceError.hidden = false;
      if (boton) retroalimentar(boton, 'error', 'Tu avance sigue sin cargar. Vuelve a intentarlo en un momento.');
    }
  }

  reintentar.addEventListener('click', () => {
    if (reintentar.dataset.estado !== 'normal') return;
    ponerEstado(reintentar, 'cargando');
    void cargarCursos(reintentar);
  });
  reconectar.addEventListener('click', async () => {
    if (reconectar.dataset.estado !== 'normal') return;
    ponerEstado(reconectar, 'cargando');
    await cargarAvance(reconectar);
    await esperar(ESPERA_EXITO_MS);
    ponerEstado(reconectar, 'normal');
  });

  // ─── Panel «Simular fallo» (?prueba=1) ────────────────────────────
  const panel = raiz.querySelector<HTMLElement>('[data-panel-prueba]');
  if (panel) iniciarPanel(panel);

  function iniciarPanel(panel: HTMLElement): void {
    for (const b of $$<HTMLButtonElement>('[data-simular-fallo]', panel)) {
      b.addEventListener('click', () => {
        const id = b.dataset.simularFallo!;
        if (escuchando) detenerEscucha(true);
        switch (id) {
          case 'sin-soporte':
            return cambiarATeclado('sin-soporte', MENSAJES['sin-soporte']);
          case 'not-allowed':
          case 'audio-capture':
          case 'network':
            return alFallar(id);
          case 'confianza':
            return procesarFrase('buscar diseño de interiores', 0.42);
          case 'no-speech':
            cambiarModo('voz');
            return noSeEscucho();
          case 'conflicto': {
            // Voz «diseño» y, 0,8 s después, clic en «Negocios».
            procesarFrase('categoría diseño', 0.93);
            window.setTimeout(() => {
              const negocios = botonesCategoria.find((x) => x.dataset.categoria === 'negocios') ?? null;
              ordenCategoria('negocios', 'clic', negocios);
            }, 800);
            return;
          }
        }
      });
    }

    const formDictado = $<HTMLFormElement>('[data-form-dictado]', panel);
    const dictado = $<HTMLInputElement>('#dictado', panel);
    formDictado.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!dictado.value.trim()) {
        retroalimentar(null, 'error', 'Escribe una frase para simular el dictado.');
        enfocar(dictado);
        return;
      }
      procesarFrase(dictado.value, 0.92);
    });

    const copiar = $<HTMLButtonElement>('[data-copiar]', panel);
    const manual = $<HTMLElement>('[data-copiar-manual]', panel);
    const manualTexto = $<HTMLTextAreaElement>('[data-copiar-texto]', panel);
    copiar.addEventListener('click', async () => {
      if (copiar.dataset.estado !== 'normal') return;
      const texto = [
        'Hora\tRegla\tMensaje\tDatos conservados',
        ...registro.map((r) => `${r.hora}\t${r.regla}\t${r.mensaje}\t${r.conservados}`),
      ].join('\n');
      try {
        await navigator.clipboard.writeText(texto);
        manual.hidden = true;
        retroalimentar(copiar, 'exito', `Registro copiado: ${registro.length} eventos.`);
        await esperar(ESPERA_EXITO_MS);
        ponerEstado(copiar, 'normal');
      } catch {
        manualTexto.value = texto;
        manual.hidden = false;
        manualTexto.select();
        retroalimentar(copiar, 'error', 'Tu navegador no dejó copiar. El registro quedó seleccionado debajo: cópialo con Ctrl + C.');
      }
    });
  }

  // ─── Arranque ─────────────────────────────────────────────────────
  if (Reconocimiento) {
    pintarVoz('lista');
  } else {
    // Regla 1 al cargar: sin firma ni robo de foco (no hubo gesto); se aplica completa al pulsar «Hablar».
    pintarVoz('no-disponible');
    mostrarAviso(MENSAJES['sin-soporte']);
  }
  if (simular === 'vacio') estado.texto = 'astronomía';
  pintarFormulario();
  void cargarCursos();
}
