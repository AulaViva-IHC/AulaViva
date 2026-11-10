<p align="center">
  <img src="docs/banner.png" alt="AulaViva: plataforma de cursos virtuales con certificados verificables" width="100%">
</p>

<h1 align="center">AulaViva</h1>

<p align="center">
  Plataforma de cursos virtuales donde el estudiante se inscribe, ve clases con subtítulos, rinde una evaluación
  y obtiene un <b>certificado verificable por código y QR</b>.
</p>

<p align="center">
  <img alt="Astro 7" src="https://img.shields.io/badge/Astro-7-FF5D01?logo=astro&logoColor=white">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-LTS-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="MySQL" src="https://img.shields.io/badge/MySQL-8.4%20(pr%C3%B3ximamente)-4479A1?logo=mysql&logoColor=white">
  <img alt="Accesibilidad" src="https://img.shields.io/badge/WCAG-2.1%20AA-1B1750">
</p>

---

## Qué incluye

| Plantilla | Ruta | Lo más destacado |
| --- | --- | --- |
| **Iniciar sesión** | `/login` | Recuerda el último correo, mostrar u ocultar contraseña, aviso de Bloq Mayús y bloqueo con cuenta regresiva tras 5 intentos fallidos. |
| **Crear cuenta** | `/registro` | Solo 4 campos, validación al salir de cada campo y medidor de seguridad de la contraseña con requisitos en vivo. |
| **Inicio del estudiante** | `/inicio` | Ruta de módulos, tareas de la semana con semáforo, anillo del próximo certificado y buscador con sugerencias. |
| **Crear curso** (administrador) | `/admin/cursos/nuevo` | Asistente en 4 pasos, borrador automático, valores sugeridos y publicación con confirmación. |

Dos roles: el **estudiante** ve y lleva cursos; el **administrador** crea y publica cursos.

## Diseño centrado en las personas

| Principio | Cómo se aplica en AulaViva |
| --- | --- |
| **Ley de Miller (chunking)** | Formularios cortos: crear curso se divide en 4 pasos con un máximo de 6 campos a la vista. |
| **Ley de Hick** | Una sola acción principal por pantalla y solo 4 categorías principales. |
| **Prevención de errores** | Valores por defecto inteligentes y validación con mensajes que dicen qué hacer. |
| **Bucle perceptual** | Cada botón responde en menos de 100 ms: hover, presión, "procesando" y éxito o error. |
| **Leyes de Gestalt** | Agrupación por fondo en lugar de bordes, rejilla de 8 px y una sola variante por función. |
| **Redundancia sensorial** | Las confirmaciones combinan respuesta visual, sonido breve y vibración, con un interruptor para silenciarlos. |
| **Los 5 estados** | Ideal, vacío, cargando, error y parcial, visibles en `/estados`. |
| **Accesibilidad** | Elementos semánticos, anuncios para lectores de pantalla, foco visible y contraste AA. |

## Tecnologías
- **Astro 7** en modo servidor con `@astrojs/node`.
- **TypeScript** y CSS propio con variables.
- **Web Audio API** y **Vibration API** para la retroalimentación multimodal.
- Contraseñas cifradas con `scrypt`.
- **MySQL 8.4** en la siguiente etapa; por ahora los datos viven en memoria en `src/lib/repositorio.ts`.

## Cómo ejecutarlo

Requisito: [Node.js](https://nodejs.org) LTS.

```bash
git clone https://github.com/Lala0-o/AulaViva.git
cd AulaViva
npm install
copy .env.example .env
npm run dev
```

Abre **http://localhost:4321**.

## Usuarios de prueba

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Estudiante | `gbarreto@correo.com` | `Aulaviva2026!` |
| Administrador | `admin@aulaviva.pe` | `Admin2026!` |

## Hoja de ruta
- [x] Iniciar sesión, crear cuenta, inicio del estudiante y crear curso
- [x] Retroalimentación multimodal (visual, sonora y háptica)
- [ ] Base de datos MySQL
- [ ] Catálogo, clase y evaluación
- [ ] Certificados con QR y verificación pública

## Equipo

Proyecto del curso **Interacción Humano-Computador** · Universidad Nacional Micaela Bastidas de Apurímac (UNAMBA).

- Gonzalo Osmar Barreto Geri
- Noel Frank Chahuayo Juárez

Docente: Betsabe Milagros Ccolqque Ruiz
