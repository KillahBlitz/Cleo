# Cleo

Sistema de subastas con Nuxt 4, Vue 3 y MongoDB. Acceso privado de administrador y panel de consulta con resumen, artículos y subastas.

## Despliegue en K3s

La [guía de despliegue](docs/DEPLOYMENT.md) explica la preparación y el uso de GitHub Actions: `devel` → namespace `cleo-dev` → `cleo-dev.kinasisdev.com`; `main` → namespace `cleo` → `cleo.kinasisdev.com`. Incluye los dos clústeres existentes, Cloudflare Tunnel, secretos por entorno, MongoDB, el runner en kinasis-eye y rollback. Docker publica únicamente el servidor compilado; `.env` queda fuera de la imagen.

Los manifiestos están separados en dos carpetas independientes: `k8s/devel` para preproducción y `k8s/prod` para producción. Cada carpeta contiene la aplicación, su configuración, namespace y túnel.

En `kinasis-eye`, se usa únicamente el usuario `kinasis-eye` y la carpeta `~/apps/cleo-setup/actions-runner`. Actions descarga el repositorio en `_work/` y reutiliza los accesos existentes de `~/.kube/kinasis`; no requiere una carpeta `setup`. Solo se configuran `MONGODB_URI` y `NUXT_SESSION_PASSWORD` en cada Environment de GitHub. La imagen de GHCR debe ser pública para descargarla sin tokens manuales. El hash del administrador permanece en MongoDB. `~/kinasis-infra` conserva la infraestructura compartida.

## Calendario de entregas

- **Panel → Entregas** (`/panel/entregas`): calendario mensual y agenda por día. Selecciona un turno libre o **Nueva cita** para registrar persona, día, hora, lugar y notas opcionales. Abre una cita con el icono de edición para reprogramarla, corregir datos o eliminarla con confirmación.
- En una subasta cerrada, **Agendar entrega** abre el formulario con su artículo y el primer postor no descartado. También puedes registrar una cita sin artículo vinculado. El nombre y Facebook del postor quedan como copia privada; las pujas originales se conservan.
- **Entregas** en la cabecera pública (`/entregas`): cualquier visitante consulta horarios libres, ocupados y pasados. El visitante acuerda la cita contigo; solo tú la reservas en el panel. Nombres, lugares, contactos y notas no son públicos.
- Horario inicial: todos los días, **10:00–18:00**, turnos de **30 minutos**, zona **America/Mexico_City**. Último turno **17:30–18:00**. La zona no depende de la configuración del navegador. La disponibilidad se actualiza cada 30 segundos mientras la página está visible.

MongoDB usa `cleo_db.appointments`, creada automáticamente al utilizar el calendario. Campos: `date`, `time`, `timeZone`, `startsAt`, `endsAt`, `recipientName`, `location`, `notes`, `articleId`, `articleTitle`, `bidderId`, `facebookUrl`, `active`, `revision`, fechas de auditoría y administrador creador. Los instantes se guardan como Date UTC. Dos índices únicos parciales impiden citas activas en el mismo turno y varias citas activas para el mismo artículo. Editar controla la revisión; eliminar marca la cita inactiva, guarda `deletedAt`/`deletedBy` y libera sus reservas sin perder la copia histórica.

Endpoints: `GET /api/public/deliveries?month=YYYY-MM` (solo horarios), `GET/POST /api/admin/appointments`, `PATCH/DELETE /api/admin/appointments/:id` y `GET /api/admin/appointments/articles`. Los listados administrativos también requieren `month=YYYY-MM`. Todas las escrituras exigen sesión admin y validación de origen. No se requieren variables de entorno adicionales.

`npm run test:catalog` incluye `scripts/check-deliveries.mjs`: autorización, privacidad, límites de horario, conversión CDMX/UTC, reservas simultáneas, edición, reprogramación entre meses, versiones obsoletas, vínculo con el postor, eliminación y reutilización de turnos. Solo utiliza la base temporal de pruebas.

## Desarrollo

```sh
npm install
npm run dev
```

Abre http://localhost:3000/login. El login consulta la colección `admin` de MongoDB. Las contraseñas se guardan como hashes scrypt con salt aleatorio; no se incluyen en el cliente ni se guardan en texto plano.

## Variables

- `NUXT_ADMIN_USERNAME`: usuario para la carga inicial; el login consulta MongoDB.
- `NUXT_ADMIN_PASSWORD_HASH`: solo para la carga inicial; hash scrypt con formato `salt:hex`, clave de 64 bytes y parámetros predeterminados de Node.
- `NUXT_SESSION_PASSWORD`: secreto aleatorio de al menos 32 caracteres.
- `MONGODB_URI` (o `NUXT_MONGODB_URI`): cadena de conexión MongoDB.
- `NUXT_MONGODB_DATABASE`: `cleo_db`.
- `NUXT_APP_ORIGIN`: origen público HTTPS en Kubernetes; vacío usa el origen de la petición durante desarrollo.
- `NUXT_TRUST_CLOUDFLARE`: `true` solo detrás del túnel con la NetworkPolicy suministrada; permite limitar el login por `CF-Connecting-IP`. Predeterminado `false`.

`server/utils/mongodb.ts` reutiliza la conexión a `cleo_db`. El login necesita MongoDB disponible y consulta `admin`; las sesiones identifican al administrador por `_id` y verifican que aún exista. No hay registro público de administradores.

Para cargar el administrador inicial desde el hash privado de `.env`:

```sh
npm run db:seed-admin
```

Este comando escribe únicamente en `cleo_db.admin`, crea un índice único para `username` y verifica la escritura. Puede repetirse sin duplicar usuarios ni sobrescribir contraseñas existentes. Guarda `username`, `passwordHash` (`salt:hex`), `passwordAlgorithm`, `createdAt` y `updatedAt`. Las variables `NUXT_ADMIN_USERNAME` y `NUXT_ADMIN_PASSWORD_HASH` pueden retirarse del entorno de producción después de esta carga; no son necesarias para iniciar sesión.

La sesión dura 8 horas y utiliza una cookie cifrada HttpOnly, SameSite=Strict y Secure en producción. Las credenciales se verifican en el servidor. El panel tiene middleware de acceso; los futuros endpoints de artículos también deberán exigir la sesión del administrador. Se limita el login a 10 intentos por IP cada 15 minutos en memoria: para múltiples servidores se deberá compartir el contador.

## Validación y producción

```sh
npm run typecheck
npm run build
node --env-file=.env .output/server/index.mjs
```

En producción utiliza HTTPS y configura las variables en tu proveedor (o carga explícitamente `.env` como en el ejemplo). Nuxt no carga `.env` automáticamente al ejecutar el servidor compilado.

Fuentes técnicas: [Nuxt](https://nuxt.com/docs/4.x/guide/directory-structure), [sesiones H3](https://v1.h3.dev/utils/advanced), [particles.js](https://github.com/VincentGarreau/particles.js).

La ruta `/login` es de acceso manual: no se enlaza desde la cabecera ni desde la portada, y tiene `noindex, nofollow`. La portada presenta el catálogo público, los destacados manuales y los filtros. Las visitas a `/panel` sin sesión vuelven a `/`. La autenticación del servidor sigue siendo la protección de acceso.


## Diseño y panel

`AGENTS.md` establece Neumorphism como regla visual obligatoria. Los tokens de `app/assets/css/main.css` definen superficies elevadas, campos hundidos, acento dorado y modos claro/oscuro. `ThemeToggle` persiste la preferencia en cookie y mantiene compatibilidad con la preferencia local anterior.

- `/panel`: selector Subastas/Ventas; en Subastas, categorías y resumen de artículos, activas, programadas y finalizadas. Ventas consulta productos disponibles/vendidos y enlaza a la gestión de compras.
- `/panel/articulos`: consulta con búsqueda, filtro y paginación de 20 registros.
- `/panel/subastas`: consulta con búsqueda, filtro y paginación de 20 registros.

Todos los endpoints `/api/admin/*` verifican la sesión contra `admin` y responden con `Cache-Control: no-store`. El panel permite crear categorías y artículos, editar y eliminar artículos desde su ficha y filtrar artículos elegibles. Los artículos activos, disponibles y vigentes de modalidad subasta aceptan pujas desde la portada. La venta directa registra pedidos y reserva unidades; la confirmación y entrega se acuerdan por Facebook, sin cobro en línea.

Los datos se leen de `articles` y `auctions`, sin insertar registros de demostración. Campos previstos: `title`, `category`, `status`, `createdAt`. Estados de artículos: `draft`, `available`, `auction`, `sold`; estados de subastas: `draft`, `scheduled`, `active`, `closed`. Las colecciones inexistentes producen listas vacías y contadores cero. Los errores de conexión se muestran como errores, no como cifras cero.


## Catálogo y filtros

```sh
npm run db:seed-types
```

Carga idempotente en `cleo_db.types`: Hot Wheels, Muñecas y Ropa, con `mode: auction`, y Labiales con `mode: sale`. Campos: `name`, `slug`, `mode`, `active`, `order`, `createdAt`, `updatedAt`; índice único por `mode` y `slug`. Solo inserta categorías ausentes y conserva las existentes.

`GET /api/admin/types?mode=auction` devuelve las categorías activas desde MongoDB. Resumen y listados filtran mediante `mode=auction|sale` y `typeId=<ObjectId>`. Los filtros inválidos devuelven 400. En la URL de las páginas se conservan `modalidad`, `categoria`, `estado`, `q` y `pagina`.

Los artículos deben guardar `mode` y `typeId` (ObjectId de `types`). Las subastas deben guardar `typeId` con la categoría de su artículo. Contadores, últimas publicaciones y listados utilizan esos mismos campos; los nombres de categoría se resuelven desde el catálogo. No se mezclan artículos de venta directa con los de subasta.

Después de compilar, `npm run test:catalog` verifica el catálogo y filtros con una base temporal `cleo_test_catalog_<id>` en el MongoDB configurado. Requiere permisos para crear y eliminar esa base de prueba; la elimina al finalizar y no modifica `cleo_db`.


## Creación de categorías y artículos

- Resumen → **Agregar categoría**: nombre y modalidad. Guarda en `types` y rechaza duplicados por modalidad y slug normalizado.
- Artículos → **Nuevo artículo** (`/panel/articulos/nuevo`): nombre, modalidad, categoría, precio inicial MXN, descripción, activo/inactivo, fecha y hora de cierre y de 1 a 5 fotos.
- Después de guardar se abre `/panel/articulos/:id`, con fotos, precio, estado y tiempo restante.
- **Editar** abre `/panel/articulos/:id/editar`: permite conservar, quitar y agregar fotos hasta un máximo total de cinco. Con pujas registradas, el precio inicial, modalidad, categoría y cierre quedan protegidos. Se pueden corregir datos de un artículo vencido sin reabrirlo.
- **Eliminar** pide confirmación y borra permanentemente el documento de `articles`, incluidas sus fotos, pujas y compras. También elimina sus favoritos y subastas vinculadas. Desaparece del panel, el catálogo y Mi actividad; no se conserva una fila de «Artículo no disponible». Las citas ya acordadas se desvinculan del artículo y conservan sus horarios y datos de reunión. La eliminación se puede repetir para completar una limpieza interrumpida.
- **Marcar como vendido** está en la ficha del artículo. Guarda `status: sold`, `soldAt` y `soldBy`, retira el destacado y libera su lugar. El artículo deja de aceptar pujas inmediatamente y sale del catálogo disponible; permanece en el panel y en la actividad personal como **Vendido**. La ficha, las fotos y las pujas públicas devuelven 404. En el historial propio se conserva el nombre y una foto por un endpoint privado que comprueba participación o guardado previo. El filtro **Vendido** funciona para subastas y ventas. La edición de otros campos no reabre una venta.
- Subastas → **Artículos disponibles**: solo artículos activos, de modalidad subasta, disponibles y con cierre futuro. Endpoint: `/api/admin/auction-eligible`.

Los endpoints de escritura requieren sesión de administrador y validación de origen. El servidor valida todos los datos, incluso el número, formato, tamaño y contenido de las fotos. Se aceptan JPG, PNG y WebP de hasta 5 MB por foto, se convierten a WebP, se eliminan metadatos y se limita su tamaño a 2000×2000 y 2 MB por foto. Las imágenes optimizadas se guardan como BinData en el mismo documento de `articles`: la escritura de artículo y fotos es atómica. Se sirven mediante endpoints de administrador, sin volcar binarios en las respuestas de listados o detalle.

Campos del artículo: `title`, `mode`, `typeId`, `description`, `initialPriceCents`, `currency: MXN`, `active`, `status`, `closesAt`, `photos`, `createdBy`, `createdAt`, `updatedAt`. `closesAt` se guarda como Date UTC y se muestra con cuenta regresiva. Los vencidos se excluyen del listado elegible en el servidor; los futuros endpoints de subastas/pujas deben utilizar `requireAuctionableArticle` o la misma condición atómica al escribir.

Reservados para las pujas: `highestBidAmountCents: null` y `highestBidder: null`. El postor podrá guardar `{ userId, name, email?, phone? }`. El formulario no puede establecer esos campos. Las pujas públicas los actualizan de forma atómica junto con el historial; no se adjudica automáticamente una venta ni se cobran pagos.

`npm run test:catalog` también cubre la creación de categorías y artículos, precios exactos, fotos, autorización, separación activo/inactivo y vencimiento. Todos los registros de prueba se crean en una base temporal y se eliminan al finalizar.


## Portada, destacados y postores

`/` muestra artículos activos, vigentes y disponibles, filtrados por modalidad/categoría, con destacados manuales al inicio. `/articulos/:id` muestra fotos, descripción, precio inicial tachado cuando existe oferta, mejor oferta, cuenta regresiva e historial ascendente. Se actualiza cada 5 segundos; la portada cada 15 segundos cuando está visible.

`star: boolean` se elige al crear el artículo o en su ficha administrativa. `starSlot` asigna uno de cinco lugares, protegidos mediante un índice único parcial; las solicitudes concurrentes no pueden superar el límite. Retirar un destacado libera su lugar. La portada solo muestra los que además están activos y vigentes; no convierte automáticamente artículos en destacados.

El icono de usuario abre un diálogo superpuesto a la página actual, con nombre para pujar y enlace de Facebook; se cierra con la X o Escape sin perder el artículo ni los filtros. `/perfil` redirige a la portada y abre ese diálogo. `/login` sigue siendo una ruta manual, con la tarjeta también superpuesta sobre el fondo. Los perfiles se guardan en `users` (`kind: bidder`) y se vinculan a una cookie cifrada HttpOnly de 180 días, independiente del administrador. No hay contraseña ni recuperación entre dispositivos en esta etapa: conocer un nombre o URL no concede acceso a otro perfil.

Se valida HTTPS, dominio Facebook y formato de perfil directo. Por decisión del administrador, se asume la existencia del perfil: no hay revisión ni aprobación manual, y cambiar el enlace no bloquea las pujas. No se comprueba propiedad ni existencia mediante Facebook Login; tampoco se muestra un distintivo de verificación. Los estados antiguos de revisión no impiden participar. Panel → Postores conserva únicamente nombre y enlace de contacto.

Cada puja almacena `{id, requestId, amountCents, createdAt, bidder: {userId, name, facebookUrl}}` dentro de `articles.bids`, ordenado ascendentemente por importe. Una actualización condicional atómica guarda la puja, `highestBidAmountCents`, `highestBidder` y `bidCount`; verifica en el servidor que el artículo esté activo, en modalidad subasta, sin vender y no haya vencido. Las nuevas pujas y los nuevos precios iniciales de subasta son en pesos enteros: el servidor rechaza centavos. El precio inicial es una referencia: la primera oferta puede ser inferior, igual o superior a ese precio, desde $1 MXN. El cliente escribe su cantidad desde la primera puja. Las siguientes ofertas deben superar la más alta registrada por al menos un peso, incluso si siguen por debajo del precio inicial; se rechazan empates y cantidades inferiores. Si la puja máxima histórica tiene centavos, la siguiente oferta empieza en el siguiente peso entero sin cambiar la historia. El formulario muestra el mínimo vigente y el servidor lo valida en la misma escritura para proteger ofertas simultáneas. Internamente se conservan centavos enteros (nuevas pujas múltiplos de 100); los precios de venta directa pueden incluir decimales; una misma solicitud repetida no duplica ofertas. La historia completa y los datos de contacto solo son accesibles al administrador; el historial público muestra nombre, importe y fecha de las últimas 100 pujas.

Para respetar el límite de documento de MongoDB junto con las fotos, esta versión admite hasta 5000 pujas por artículo y rechaza más sin eliminar historial. Para volúmenes superiores se requerirá separar las pujas y usar transacciones sobre un replica set. La instalación actual funciona en MongoDB standalone.

En la ficha administrativa, los postores se presentan de mayor a menor oferta, conservando la mejor oferta de cada persona. Al terminar, **Sin acuerdo → pasar al siguiente** marca ese postor en `declinedBidderIds` y propone al siguiente sin eliminar ninguna puja ni cambiar la oferta histórica máxima. Ningún mensaje de Facebook se envía automáticamente.

**Eliminar puja** permite moderar una oferta desde el ranking o el historial completo de la ficha administrativa. Tras confirmar, `DELETE /api/admin/articles/:id/bids/:bidId` elimina físicamente esa puja de `articles.bids`, sin baja lógica. Una sola actualización atómica recalcula la mejor oferta, su postor y el total de pujas, preservando las ofertas que lleguen simultáneamente. Si quedan otras pujas de la misma persona, se conserva su mejor oferta restante; si no queda ninguna puja, la subasta vuelve a aceptar cualquier oferta positiva desde $1 MXN, incluso inferior al precio inicial. Los listados públicos y Mi actividad reflejan las pujas restantes. No se reabre una subasta vencida o vendida ni se modifica una cita ya acordada. Repetir el borrado es seguro.

`scripts/check-bid-moderation.mjs`, incluido en `npm run test:catalog`, comprueba autorización, borrado físico, recálculo de postores, historial personal y público, reinicio sin ofertas, reintentos, concurrencia y conservación de ventas, cierres y citas en la base temporal.

`npm run test:catalog` también comprueba solicitudes concurrentes de destacados y pujas, reintentos, privacidad, perfiles sin aprobación, ofertas inferiores al precio inicial, rechazo de pujas fraccionarias y de importes que no superan la mejor oferta, primeras pujas simultáneas, vencimiento, siguiente postor, edición con fotos y pujas, eliminación física y estados de vendido. `check-article-lifecycle.mjs` verifica la limpieza de referencias, ausencia de artículos eliminados en la actividad, conservación independiente de citas, venta concurrente con una puja, auditoría, idempotencia y liberación de destacados. La base temporal se elimina al terminar. Para revisión visual aislada puede usarse `CLEO_VISUAL_QA=1 npm run test:catalog`; muestra una URL temporal y limpia los datos al interrumpir con Ctrl+C.


## Mi actividad

`/mi-actividad` está en la cabecera pública. Usa el perfil del navegador actual y muestra:

- **Mis pujas**: artículos en los que participaste, tu mejor oferta, oferta más alta, cierre y estado (vas ganando, superaron tu oferta, finalizada, en espera o sin acuerdo). El contador solo incluye subastas en curso, nunca las cerradas.
- **Guardados**: corazón en las tarjetas y en la ficha del artículo. Persisten en `cleo_db.favorites` mediante un índice único por persona/artículo; quitar uno no modifica los guardados de otra persona. Si aún no tienes perfil, se abre el diálogo y se completa el guardado tras crear el perfil.
- **Segundas oportunidades**: subastas cerradas en las que el administrador descartó al postor anterior y ahora te corresponde el primer turno disponible. No se adjudican ni cobran automáticamente.

Los listados tienen paginación de 12 artículos y se actualizan cada 15 segundos mientras están visibles; estados de cierre y contador activo también consideran el reloj del servidor. Los eliminados desaparecen por completo de los listados y contadores. Los artículos únicamente inactivos (que aún existen en el panel) aparecen sin fotos ni enlaces públicos; sus favoritos se pueden quitar. Los vendidos se identifican como **Vendido**, sin enlace a una ficha pública. Los datos se obtienen solo desde la sesión cifrada del postor; no se aceptan IDs de usuario externos y no se exponen contactos ajenos.

Endpoints: `GET /api/public/activity?tab=bids|saved|opportunities&page=1`, `GET /api/public/favorites` y `PUT /api/public/favorites/:id` con `{saved: boolean}`. La actividad requiere perfil y se sirve sin caché. `scripts/check-activity.mjs`, incluido en `npm run test:catalog`, comprueba privacidad entre personas, estados abiertos/cerrados, orden de oportunidad, favoritos concurrentes, persistencia y paginación sobre la base temporal.


## Ventas por artículo y paquete

- En **Nuevo artículo → Venta**, captura nombre, tipo **Artículo / Paquete**, categoría, precio fijo, unidades disponibles, descripción y de una a cinco fotos. Para paquetes, el precio con descuento es obligatorio, positivo y menor al original. Una unidad equivale a un artículo o a un paquete completo. Las ventas no requieren fecha de cierre.
- El catálogo y los destacados muestran el precio efectivo y, para paquetes, el precio original tachado. Se conserva el máximo global de cinco destacados manuales. Solo se ofrecen productos activos, sin vender y con existencias.
- El cliente guarda su perfil, selecciona unidades y pulsa **Comprar**. Se registra la compra y se indica que el vendedor lo contactará por Facebook. El contacto queda como copia privada para el administrador. No se envían mensajes automáticamente ni se procesa un pago.
- **Panel → Ventas** (`/panel/ventas`) lista compras y permite filtrar por estado. **Pendiente** reserva inmediatamente; **Cancelar compra** devuelve las unidades una sola vez; **Completar compra** cierra la compra sin volver a descontar. Cancelada y completada son definitivas. La ficha de un producto enlaza a sus compras y permite editar, eliminar o destacar.
- Al completar la última reserva, si no quedan existencias ni otras compras pendientes, el producto se marca vendido y libera su destacado. No se permite marcar manualmente un producto como vendido mientras tenga compras pendientes.
- **Mi actividad → Mis compras** muestra solo las compras de la sesión actual, con cantidad, precio acordado, total y estado, incluidas las de productos vendidos. La eliminación física de un producto también elimina sus compras; el diálogo lo advierte.

En `articles`, `saleType` es `item|package`, `units` cuenta existencias **disponibles** (excluye reservas) y `discountPriceCents` es el precio efectivo de un paquete. Los precios conservan centavos enteros. `closesAt` es `null` en ventas. Al editar inventario, el formulario envía `revision` y se rechazan formularios obsoletos: una compra concurrente nunca se sobrescribe. Los precios y contactos de pedidos existentes son copias históricas; la modalidad y el tipo de producto no cambian después de recibir compras.

`articles.purchases` contiene pedidos con ID, `requestId`, comprador, título/categoría/tipo, cantidad, precio original, precio unitario acordado, total, estado y auditoría. Guardar pedido y reservar stock es una sola escritura atómica; cambiar estado y devolver existencias también. Funciona en MongoDB standalone. Repetir el mismo intento de compra o estado no duplica pedidos ni movimientos. Los reintentos de red conservan su identificador.

Endpoints: `POST /api/public/articles/:id/purchases` (cantidad, precio esperado e identificador de intento), `GET /api/public/purchases`, `GET /api/admin/purchases` y `PATCH /api/admin/purchases/:articleId/:id` (`status: pending|cancelled|completed`). El servidor calcula el precio y total, valida stock y limita las escrituras; el cliente no puede elegir comprador ni estado. Las respuestas públicas nunca incluyen contactos ajenos. `scripts/check-sales.mjs` prueba las reservas simultáneas, reintentos, precios, paquetes, cierre/cancelación concurrentes, privacidad, formularios obsoletos, vendidos y borrado definitivo en una base temporal.


## Mapa de entregas para clientes

`/mapa` aparece en la navegación pública, sin entrada en el panel administrativo, con el título de sección **Puntos de preferencia**. Resalta San Andrés Tomatlán, Culhuacán, Tláhuac, Periférico Oriente, Zapata, Mixcoac y Bellas Artes. Permite centrar cada estación, ver todos los puntos, consultar el mapa completo, acercar/alejar, arrastrar, ampliar con dos dedos y desplazarse con teclado. Enlaza al calendario público para acordar el horario.

`public/maps.pdf` es una copia del PDF proporcionado en `bugs/mapa micdmx.pdf`. Para conservar la legibilidad al acercar, `public/maps/cdmx.webp` es una representación de 3827×5103 píxeles de la versión original enlazada dentro del PDF: <https://metro.cdmx.gob.mx/storage/app/media/red/mapa_transporte_cdxm_150419.pdf>. Se sirve localmente; no necesita API externa, geolocalización, conexión con mapas ni variables adicionales. Los siete marcadores se superponen en SVG a las coordenadas del documento original (2551.1799×3401.5701), medidas en los círculos de las estaciones y centralizadas en `app/data/preferenceStations.ts`. El encuadre inicial y el botón Ver puntos se adaptan a todas las estaciones y al tamaño del visor. Al sustituir el mapa base, recalibrar estas posiciones. Se conserva la atribución y se presenta como mapa de referencia, sin calcular rutas ni afirmar el estado actual de las líneas.
