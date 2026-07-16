# Propuesta: scaffold inicial del monorepo

## Por qué
El repo solo tiene PLAN.md y sdd/. Necesitamos la estructura de carpetas y
archivos de configuración base para que los tres paquetes puedan desarrollarse
de forma independiente pero compartir tipos y el motor de reglas.

## Capacidades que toca
Ningún spec cambia — esta propuesta no altera ningún requisito de
comportamiento. Crea la infraestructura sobre la que se implementarán las
5 capacidades definidas en sdd/specs/.

## Alcance
- pnpm workspace (pnpm-workspace.yaml, package.json raíz)
- packages/reglas: TypeScript puro (sin HTTP ni ORM)
- apps/api: Node/Express + TypeScript + Prisma + SQLite
- apps/web: Vite + React + TypeScript + Tailwind CSS + lucide-react
- .gitignore, tsconfig base, scripts de desarrollo

## Fuera de alcance
- Implementación de ninguna calculadora ni endpoint (eso va en cambios propios)
- Seed de la base de datos
- Autenticación del panel admin
