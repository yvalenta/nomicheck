---
estado: hecha
dueño: ambos
fecha: 2026-08-31
tema: «Entrar (solo lectura)» del admin_plataforma a cualquier empresa desde /admin — el paso 6 que la tarea multiorg dejó preparado
criterio_cierre: botón por empresa en /admin que otorga membresía rol auditor (por el embudo lib/membresias.ts, auditada) y cambia la empresa activa; con esa vista TODA la superficie de escritura de /empresa responde 403 (suite negativa por enumeración de la matriz); «Salir de la vista» revoca la membresía y vuelve a /admin; typecheck limpio en los 4 workspaces y suite completa verde
---

Pedido de Yonatan (2026-08-31, sesión del punto de borradores → ruteada acá):
el superadmin `megaplex.med@gmail.com` gestiona empresas desde `/admin`, pero
hoy no puede ENTRAR a ninguna — `cambiarEmpresaActiva` exige membresía a
propósito. Se quiere «cambiar de organización» desde ese dashboard. GO
explícito: **arrancar solo lectura**.

El diseño ya está decidido por la tarea hermana
(tareas/2026-08-31-matriz-permisos-y-multiorg.md, paso 6, hecha sin este
paso): **membresía temporal explícita de rol `auditor` (solo lectura por
matriz), otorgada por el embudo único `lib/membresias.ts`, auditada — jamás
impersonar credenciales ni bypass en `requiereAuth`**. La infraestructura ya
existe: matriz con `auditor` sin ninguna celda de escritura, triggers de
auditoría sobre `MembresiaEmpresa`, y el test que protege el camino
(membresias.test.ts: «el 'ver como' del admin_plataforma sigue entrando»).

Lo que falta construir (esta tarea):
1. API: `POST /admin/empresas/:id/entrar` (solo `plataforma.empresas`) —
   otorga la membresía auditor vía el embudo + fija empresa activa, todo
   dentro de `conAuditoria`; el salir es **`POST /auth/vista-plataforma/salir`**
   (desviación deliberada del plan original `/admin/empresas/:id/salir`: con
   la vista puesta el rol EFECTIVO es auditor y todo `/admin` responde 403 —
   un salir bajo `/admin` encerraría al admin adentro; va por `/auth` con
   solo `requiereAuth`, como `empresa-activa`, y la cuenta se verifica en el
   servicio). Idempotentes y con 409/422 coherentes.
2. Web: botón «Entrar (solo lectura)» por fila en DashboardAdmin; en
   EmpresaApp, cuando el rol efectivo es `auditor` y la cuenta es
   `admin_plataforma`, barra fina «Vista de plataforma (solo lectura) —
   Salir» (regla de resta: sin íconos ni copy de más).
3. Specs: la suite negativa del criterio (cada permiso de escritura de la
   matriz → 403 con esta vista), el flujo entrar→ver→salir, y guardas de
   los dos endpoints nuevos en guardas.test.ts.

## Bitácora
- 2026-08-31: tarea creada con GO de Yonatan («dale, declara la tarea y
  arranquemos con solo lectura»). Verificado antes de escribir: el paso 6 de
  la tarea multiorg quedó documentado en lib/membresias.ts y protegido por
  test, pero sin endpoint ni UI — esto lo construye.
- 2026-08-31: **HECHA — criterio medido completo** (sin push; commit local de
  cierre). Línea base antes de tocar: 1669 pruebas verdes. Construido:
  `entrar` (embudo + puntero en UN `conAuditoria`, rechaza suspendida,
  inexistente y membresía real), `salir` por `/auth` (ver desviación arriba),
  `rolCuenta` en `UsuarioAutenticado`/whoami, rescate del middleware
  (suspender la empresa con la vista puesta ya no encierra a la cuenta de
  plataforma), portal `/empresa` abierto al rol `auditor` (aplica también a
  auditores reales, antes rebotaban), barra ámbar con Salir, botón Entrar en
  /admin. **La revisión adversarial (3 lentes → 2 escépticos por hallazgo)
  pagó la pasada: 11 hallazgos confirmados, 0 refutados**, todos cerrados en
  la misma sesión. Los tres que importan: (1) ALTA — `asignarStaff` podía
  absorber/re-rolear la cuenta de plataforma (su estado normal es idéntico a
  una cuenta libre) y con la vista puesta eso le daba ESCRITURA al superadmin
  y lo dejaba encerrado sin /admin ni salir → guarda nueva «opera la
  plataforma», que además funda el invariante del que depende todo: toda
  membresía auditor de la cuenta de plataforma ES una vista; (2) membresías
  de vista huérfanas por tres caminos (rescate+entrar a otra, dos entrar
  encimados, el selector hacia una membresía real) → `entrar` barre las
  vistas previas y `salir` barre TODAS las vistas, no solo la del puntero;
  (3) dos huecos del arnés verificados POR MUTACIÓN por los revisores: nada
  fijaba que el salir no lleve permiso (montarle uno encierra al admin con
  978 verdes) y la suite negativa filtraba —en vez de nombrar— una ruta de
  escritura colgada de un permiso `.ver` → pin de excepción + aserción
  método×`.ver`. Medido por la sesión al cierre: **1701 pruebas verdes**
  (983 api / 205 web / 478 reglas / 35 mcp; +32 sobre la base), typecheck
  limpio en los 4 workspaces. Sin pasada de navegador: la verificación es de
  suite y tipos; la visual queda para cuando el deploy de la API (gobernado
  en nomicheck_ops) sirva este código.
- 2026-08-31: **DESPLEGADO con GO directo de Yonatan** («dale» al push +
  deploy). Push `a3af6dd..84f2b7b`; CI verde (pruebas + publicar-imagen);
  `deploy.sh` en Lightsail con sus cuatro comprobaciones en verde; medido
  desde afuera: `/api/health` publica `84f2b7b` (el sha exacto), `POST
  /auth/vista-plataforma/salir` y `POST /admin/empresas/:id/entrar` responden
  **401, no 404** (las rutas existen y piden sesión), el muro sigue en 402.
  Auditores del vault de ops tras el deploy: coherencia OK y 47 afirmaciones
  del mundo en verde (la fila `desplegado` compara lo servido en vivo). El
  standby se trae solo (timer de paridad cada 30 min). El botón ya existe en
  nomicheck.ynt.codes/admin; el visto visual del flujo entrar→ver→salir
  logueado es de Yonatan.
