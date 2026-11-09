// Usuarios de prueba mientras no hay base de datos.
// Las contraseñas están cifradas con scrypt (mismo formato que auth.ts):
//   gbarreto@correo.com / Aulaviva2026!   → estudiante
//   admin@aulaviva.pe   / Admin2026!      → admin
// Cuando se conecte MySQL, estos datos pasan a db/seed.sql y este archivo se borra.

export type Rol = 'estudiante' | 'admin';

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  passwordHash: string;
  rol: Rol;
  creadoEn: Date;
}

export const usuariosDemo: readonly Usuario[] = [
  {
    id: 1,
    nombre: 'Gonzalo Barreto',
    correo: 'gbarreto@correo.com',
    passwordHash:
      'scrypt$16384$8$1$Q4ctFMlos4E8/nZ+VqucOQ==$QJJ71P3C7jpjz7zVW15o3+TwC1lcwDrrAV+5qspys3jzoWIp25bSewKMBzDpqQSNCfF4gEHJi+Stp7aItk0hZQ==',
    rol: 'estudiante',
    creadoEn: new Date('2026-03-01T00:00:00Z'),
  },
  {
    id: 2,
    nombre: 'Administrador',
    correo: 'admin@aulaviva.pe',
    passwordHash:
      'scrypt$16384$8$1$MaOfSFd1dfkH5T5vl+1tRw==$6QsIMTULPoi3JG5Z7rCh6YpUTTDhOblmGHEmVi3LjHgzqWn15OVgNjYfcTCoWBGpq6W/lyLxSR/AV/FYobPhPw==',
    rol: 'admin',
    creadoEn: new Date('2026-03-01T00:00:00Z'),
  },
];
