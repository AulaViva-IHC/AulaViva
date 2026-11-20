# Trabajo en equipo — AulaViva

## Quién hace qué

| Integrante | Rama | Responsable de |
|---|---|---|
| **Gonzalo** | `estudiante` | Todo lo del estudiante (ver abajo) |
| **Noel** | `admin` | Todo lo del administrador (ver abajo) |

### Gonzalo — rama `estudiante`
- Páginas: `/inicio`, `/catalogo`, `/cursos/[slug]`, `/mis-cursos`, `/clase`, `/evaluacion`, `/resultado`, `/certificados`, `/verificar`, `/notificaciones`, `/actividad-*`.
- Sus scripts en `src/scripts/` (por ejemplo `inicio.ts`, `catalogo.ts`, `clase.ts`, `evaluacion.ts`…).
- Sus APIs en `src/pages/api/` (todo lo que **no** está en `src/pages/api/admin/`).

### Noel — rama `admin`
- `src/pages/admin/`
- `src/pages/api/admin/`
- `src/scripts/crear-curso.ts`
- `src/layouts/Admin.astro`
- El menú de administrador del Sidebar (`admin: [...]` en `src/components/Sidebar.astro`).

## Archivos compartidos (avisar antes de tocar)

Escríbele al otro **antes** de modificar cualquiera de estos:

- `src/lib/repositorio.ts`
- `src/lib/datos-demo.ts`
- `src/styles/` (`tokens.css`, `base.css`, `contraste.css`)
- `src/scripts/multimodal.ts`
- `src/middleware.ts`
- `src/i18n/*.json`
- `src/components/` (Sidebar, Topbar, Boton, Campo y demás componentes compartidos)

Los cambios en estos archivos van en **commits separados** con un mensaje claro, por ejemplo:
`Admin: nuevo token --color-alerta en tokens.css`.

## Flujo diario

Al empezar (dentro de tu rama):

```bash
git checkout <tu-rama>
git pull origin main
```

Al terminar:

```bash
git add .
git commit -m "Estudiante: descripción del cambio"
git push
```

Para unir tu trabajo a `main`: abre un **Pull Request** en GitHub de tu rama hacia `main`. Lo revisa y aprueba el otro integrante antes de hacer merge.

## Reglas

- **Nada de push directo a `main`.** Todo entra por Pull Request.
- Commits en español con prefijo **`Estudiante:`** o **`Admin:`**.
- Sin coautores de IA en los commits (no agregar líneas `Co-Authored-By` de asistentes).

## Configuración para un integrante nuevo

```bash
git clone https://github.com/AulaViva-IHC/AulaViva.git
cd AulaViva
npm install
git checkout admin
```

1. Copia `.env.example` como `.env`:
   ```bash
   cp .env.example .env
   ```
2. Genera tu `SESSION_SECRET` con el comando que trae el archivo y pégalo en `.env`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Pídele el `CLAUDE.md` a tu compañero (no está en git) y ponlo en la raíz del proyecto.
4. Los usuarios de prueba están en `src/lib/usuarios-demo.ts`.

## CLAUDE.md

`CLAUDE.md` está en `.gitignore`, así que no viaja por git. **Cuando uno lo actualice, le pasa la copia al otro** para que los dos trabajen con las mismas reglas.
