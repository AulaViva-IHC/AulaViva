# Trabajo en equipo — AulaViva

## Quién hace qué

Desde que el PR #2 (parte de administrador) entró a `main`, **Gonzalo hace todos los cambios**.

| Integrante | Rama | Uso |
|---|---|---|
| **Gonzalo** | `estudiante` | Todo el proyecto: estudiante, administrador y archivos compartidos |
| **Noel** | `admin` | Solo para terminar las correcciones de su PR #2 |

### Gonzalo — rama `estudiante`
La rama `estudiante` tiene todo el proyecto. Gonzalo puede cambiar **cualquier archivo**:

- Estudiante: páginas, scripts de `src/scripts/` y APIs de `src/pages/api/`.
- Administrador: `src/pages/admin/`, `src/pages/api/admin/`, `src/scripts/admin-*.ts`, `src/scripts/crear-curso.ts`, `src/layouts/Admin.astro`.
- Compartidos: `src/lib/`, `src/styles/`, `src/components/`, `src/i18n/*.json`, `src/middleware.ts`, `src/scripts/multimodal.ts`.

### Noel — rama `admin`
Queda solo para cerrar las correcciones pendientes del PR #2. Las actividades nuevas no se hacen en esta rama.

## Cada actividad se aplica a todo el sistema

Toda actividad nueva se aplica en los **dos lados**:

- **Estudiante:** `/`, `/catalogo`, `/cursos/[slug]`, `/inicio`, `/mis-cursos`, `/clase/[id]`, `/evaluacion/[id]`, `/resultado/[id]`, `/certificados`, `/verificar`, `/notificaciones`.
- **Administrador:** `/admin`, `/admin/cursos`, `/admin/cursos/nuevo`, `/admin/usuarios`, `/admin/certificados`.
- **Incluidas sus versiones en `/estados`** (solo desarrollo), también las de administrador: `/estados?p=admin-panel`, `admin-cursos`, `admin-usuarios` y `admin-certificados`.

Al planificar una actividad se escribe por separado **qué cambia en estudiante** y **qué cambia en administrador**.

## Flujo de cada actividad

Antes de empezar:

```bash
git switch estudiante
git pull origin main
```

Al terminar:

```bash
npm run build
npx astro check          # sin errores
git add .
git commit -m "Act. N: descripción del cambio"   # o "Estudiante: …"
git push
```

Luego abre un **Pull Request** en GitHub de `estudiante` hacia `main`.

## Reglas

- **Nada de push directo a `main`.** Todo entra por Pull Request desde `estudiante`.
- Commits en español con prefijo **`Estudiante:`** o **`Act. N:`** (Noel usa `Admin:` solo para las correcciones de su PR #2).
- Sin coautores de IA en los commits (no agregar líneas `Co-Authored-By` de asistentes).
- `npm run build` y `npx astro check` deben pasar antes de cada push.

## Configuración para un integrante nuevo

```bash
git clone https://github.com/AulaViva-IHC/AulaViva.git
cd AulaViva
npm install
git switch estudiante
```

1. Copia `.env.example` como `.env`:
   ```bash
   cp .env.example .env
   ```
2. Genera tu `SESSION_SECRET` con el comando que trae el archivo y pégalo en `.env`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Pide el `CLAUDE.md` (no está en git) y ponlo en la raíz del proyecto.
4. Los usuarios de prueba están en `src/lib/usuarios-demo.ts`.

## CLAUDE.md

`CLAUDE.md` está en `.gitignore`, así que no viaja por git. **Cuando se actualice, se pasa la copia** a quien lo necesite para trabajar con las mismas reglas.
