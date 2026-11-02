# Base de datos de Pollos Roly

## Instalar en Supabase

1. Crea un proyecto NUEVO para **Pollos Roly**. No uses el de Pollos Qué Delicia.
2. En **SQL Editor → New query**, copia **todo** `01_pollos_roly.sql` y pulsa **Run**. Se ejecuta en una transacción. Puede repetirse sobre el mismo esquema v1 sin borrar datos; no es un actualizador de esquemas antiguos.
3. En **Authentication → Users → Add user**, crea tu usuario con correo y contraseña. Confirma el correo con la opción de la interfaz si quieres entrar sin esperar el mensaje de confirmación.
4. Abre `02_primer_administrador.sql`. La declaración `v_correo text := ...` contiene el correo configurado. Para otra cuenta, cambia solo esa declaración; conserva la comparación que detecta el marcador. Ejecuta el archivo completo en SQL Editor.
5. Ejecuta completo `03_productos_pollos.sql` para los campos del producto, ofertas y fotografías.
6. Ejecuta completo `04_compras_multiples.sql` para registrar varios insumos por compra. En una base existente ejecuta las actualizaciones pendientes y pulsa Actualizar datos; no repitas 01.

El primer archivo crea tablas, restricciones, índices, funciones, vistas y RLS. Solo carga categorías iniciales y configuración; no crea ventas, precios, stock o empleados ficticios. El segundo activa tu perfil como Administrador. No crea ni almacena contraseñas.

El script se detiene si detecta perfiles de otro sistema sin la marca del esquema de Roly. No importa automáticamente los ejemplos o cambios del navegador.

## Conexión de la aplicación

La aplicación ahora usa Supabase para iniciar sesión y guardar los datos. La URL y la clave pública **publishable** (o `anon`) se configuran en `.env.local`, siguiendo `.env.example`. Reinicia el servidor cuando cambies esos valores. Ejecutar SQL en otro proyecto no cambia automáticamente la configuración de la aplicación.

No hace falta compartir tu contraseña de Supabase ni pegar una clave `secret` o `service_role` en el chat. Las operaciones usan la sesión del administrador y RLS. Crea cuentas nuevas en Authentication → Users y pulsa Actualizar usuarios en el sistema para asignarles sus permisos. La invitación automática no forma parte de esta conexión con clave pública.

## Apartados y tablas

| Apartado | Tablas / vistas |
|---|---|
| Dashboard, Ventas y Reportes | `pedidos`, `detalle_pedido`, `pagos_pedido`, `resumen_ventas`, `resumen_pagos`, `resumen_productos` |
| Caja | `turnos_caja`, `movimientos_caja` |
| Avisos | `comunicados` |
| Menú | `categorias`, `productos` |
| Snacks | `stock_snacks` |
| Insumos | `insumos`, `alertas_stock` |
| Proveedores / Compras | `proveedores`, `compras` |
| Usuarios del Sistema / Mi Perfil | `perfiles`, relacionados con `auth.users` |
| Asistencia | `asistencias`, relacionada con `perfiles` |
| Usuarios del Sistema / Pagos al Personal | `perfiles`, `personal_operativo`, `pagos_personal` |
| Ingreso / Egreso | `movimientos_financieros` |
| Sucursales / Configuración | `sucursales`, `configuracion` |

Las columnas usan español y UUID. `lib/supabase/mapping.ts` traduce los datos a la interfaz y `app/admin/actions.ts` valida y guarda los cambios. Los datos demo no se importan. El mes de un pago se guarda como primer día del mes: `2026-10` en pantalla corresponde a `2026-10-01` en SQL. `correo_contacto` del perfil no cambia el correo de acceso de Auth.

## Funciones del servidor

La aplicación usa `supabase.rpc(...)` para estas operaciones:

| Función | Comportamiento |
|---|---|
| `registrar_compra` | Compra de un insumo y aumento de stock atómicos. |
| `anular_compra` | Revierte una sola vez si hay existencias suficientes. |
| `abrir_turno` | Abre caja para el usuario autenticado; un turno abierto por sucursal. |
| `registrar_movimiento_caja` | Ingreso/retiro de un turno abierto sin sobregirar efectivo. |
| `cerrar_turno` | Guarda esperado, contado, diferencia y cierre. |
| `registrar_pedido` | Preparación para POS: precios del servidor, pagos mixtos y descuento de snacks. |
| `cambiar_estado_pedido` | Cancela devolviendo snacks una vez; protege cajas cerradas. |
| `actualizar_mi_perfil` | Edita datos de contacto sin elegir rol ni activarse. |

Compras, caja y pedidos no admiten escrituras directas desde el cliente. Los pagos realizados al personal son inmutables; finanzas admite solo alta y consulta. El inventario permite eliminar insumos únicamente cuando no están vinculados a compras; el historial de compras impide borrar los demás. Las correcciones de movimientos ya contabilizados requieren registrar su contrapartida.

Los usuarios nuevos reciben un perfil **inactivo** con rol Cajero. Los roles enviados en metadata no otorgan privilegios. Solo Administrador activo gestiona el negocio en esta etapa; Supervisor y Cajero quedan sin acceso operativo hasta implementar sus módulos.

Las compras y la nómina no crean retiros de caja automáticamente. El balance de Reportes suma ventas y otros ingresos, y resta compras, pagos realizados y otros egresos. No calcula utilidad contable ni costo de insumos consumidos.

## Verificación

`npm run test:db` ejecuta el SQL en PostgreSQL embebido (PGlite), con Auth simulado: instalación repetible, RLS, roles, transacciones, anulaciones, pagos mixtos, stock y caja. La conexión real también se comprobó: acceso del administrador, lectura y guardado de configuración con recarga y restauración del valor original, además de bloqueo sin sesión.

Instalar el motor de pruebas, si hace falta: `npm install --prefix tests/sql-runtime`. No forma parte de la aplicación publicada.

Referencias oficiales: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [perfiles y Auth](https://supabase.com/docs/guides/auth/managing-user-data), [funciones SQL](https://supabase.com/docs/guides/database/functions).


## Actualización del formulario de Pollos

En una base ya instalada, ejecutar **03_productos_pollos.sql completo** en Supabase → SQL Editor → New query → Run. Después pulsar Actualizar datos en el sistema. Para una instalación nueva, ejecutar 01, 02 y 03 en ese orden. No hace falta volver a crear usuarios ni volver a ejecutar 01 sobre la base actual.

03 agrega descripción, precio de oferta, fotografía, orden, selección de acompañamientos y tipo de presas. Los valores de presas son leg_thigh (Pierna y Contra), breast_wing (Pecho y Ala) y all (Todas). Son independientes del precio. La oferta debe ser positiva y menor al precio regular. El RPC registrar_pedido aplica el precio de oferta sin modificar ventas antiguas.

Las fotografías JPG/PNG/WebP de hasta 5 MB se guardan en el bucket público productos; son imágenes del menú. Solo un administrador activo puede subir, listar o eliminar archivos. La aplicación valida la firma del archivo y reemplaza fotografías con rutas únicas. Un fallo de guardado puede dejar un archivo sin usar; se conserva para evitar borrar una fotografía cuyo guardado no se pudo confirmar.

La clave anon usada por la aplicación no puede crear columnas ni políticas. Este cambio requiere ejecutar el SQL con el SQL Editor del propietario del proyecto. Nunca coloques una clave service_role en el navegador ni en variables NEXT_PUBLIC.

Referencias de Storage: [acceso con RLS](https://supabase.com/docs/guides/storage/security/access-control) y [buckets y límites de subida](https://supabase.com/docs/guides/storage/buckets/creating-buckets).


## Actualización de Registrar compra

Ejecuta **04_compras_multiples.sql completo** en Supabase → SQL Editor → New query → Run. Es independiente de 03; requiere la base 01 y el administrador 02. No borra ni reagrupa compras anteriores.

El formulario selecciona una sucursal activa, un proveedor opcional, comprobante y fecha. Agrega insumos existentes o nuevos con unidad, cantidad y precio unitario; revisa subtotales y total, quita líneas y confirma la lista. Si escribiste otro insumo pendiente, debes añadirlo o borrar su nombre antes de confirmar. Para cambiar de sucursal, quita primero las líneas de la lista.

El RPC registrar_compra_multiple valida el administrador, la sucursal, el proveedor y todos los insumos. Crea los nuevos y actualiza existencias en una transacción. Un documento repetido se rechaza para evitar duplicar compras al reintentar. El historial muestra una fila por compra; Reportes suma las líneas una sola vez, con redondeo a dos decimales por línea.

Anular cualquier línea del documento revierte todas juntas. Si falta stock de un insumo, no anula nada. Las compras antiguas siguen anulándose individualmente. Los insumos nuevos quedan en inventario con mínimo 0 para que puedas ajustarlo después. La compra no genera un retiro de caja automático.

Pruebas: npm test incluye validación, subtotales y agrupación del historial. npm run test:db ejecuta 04 dos veces y verifica proveedor opcional, insumos nuevos, reintentos, fallo parcial sin cambios, anulación conjunta y acceso exclusivo de administradores.


## Roles y registro biométrico de asistencia

Ejecuta `05_roles_usuarios.sql` para habilitar Supervisor, Cocinero, Mesero, Repartidor y Limpieza como roles de usuario. Ejecuta `06_asistencia.sql` para crear la tabla de asistencia y, después, `07_asistencia_biometrica.sql` para guardar plantillas faciales, permitir asistencias sin foto y bloquear nuevas cargas de imágenes. Ejecuta también `08_salida_asistencia.sql` para guardar la hora de salida al cerrar sesión y mostrarla en el apartado de asistencia del administrador. Los usuarios activos con esos roles irán a `/asistencia` después de iniciar sesión. La primera vez se pide permiso explícito y se guarda una plantilla numérica del rostro; las próximas entradas comparan contra esa plantilla y guardan fecha y hora sin una foto nueva. Los pasos de frente, derecha y regreso al frente comprueban movimiento de la cabeza. La plantilla está aislada por cuenta. Administrador conserva acceso al panel.

Para que las cuentas de usuario aparezcan en el selector de Pagos al Personal, ejecuta `09_usuarios_personal_nomina.sql`. Vincula las cuentas existentes y sincroniza nuevas cuentas con sucursal asignada al directorio interno de nómina. Las cuentas y sus sucursales se administran desde Usuarios del Sistema. Ejecuta también `10_pago_personal_formulario.sql` para registrar pagos vinculados a una cuenta o con un nombre manual, elegir tipo de pago, estado, descripción y observaciones.

## Punto de venta del cajero

Ejecuta `11_cajero.sql` en Supabase después de las migraciones anteriores. El archivo repara las tablas POS faltantes sin borrar productos ni movimientos; requiere que existan `perfiles` y `sucursales` con las columnas de Pollos Roly. El Cajero activo debe tener sucursal asignada en Usuarios del Sistema. Al iniciar sesión entrará a `/cajero`, donde puede abrir su turno, registrar ventas de productos activos, elegir Efectivo/QR/Tarjeta, registrar ingresos o egresos y cerrar la caja con arqueo. El punto de venta limita el acceso a datos de su sucursal y las operaciones validan precios, promociones, stock de snacks y turno en la base de datos.

Para pedir platos de pollo con selección por porción, ejecuta `14_personalizacion_pollo.sql` después de 11, 12 y 13. Los productos con “Requiere elegir presas/acompañamientos” activado pedirán una presa disponible según su configuración: Pechuga y Ala, Pierna y Contra, o las cuatro. Cada unidad permite elegir Brasa o Broaster y los acompañamientos Arroz, Fideo y Papa. Los métodos de pago del cajero son Efectivo y QR; Mixto permite combinar ambos. Las elecciones se guardan con el detalle del pedido y se muestran tanto en la comanda de cocina como en el comprobante del cliente. Al aumentar la cantidad, cada nueva unidad abre su propia selección; al editar o reimprimir se conserva la configuración guardada.

Para administrar bebidas por sucursal, ejecuta `15_inventario_bebidas.sql` después de 11, 12, 13 y 14. Aparecerá el apartado **Bebidas** en el administrador. Cada producto de la categoría Bebidas se muestra por sucursal, permite registrar unidades en freezer y almacén, y el POS muestra el total disponible. Las ventas descuentan primero del freezer y después del almacén; editar pedidos revierte el consumo anterior y las anulaciones restituyen las cantidades en su ubicación original.

Para que cada nueva venta aparezca ya como completada en el historial del cajero, ejecuta `16_pedidos_completados.sql` en Supabase. La base conserva el estado interno `Entregado`, que el punto de venta presenta como **Completado**.

Para habilitar el botón **Eliminar** del apartado Insumos, ejecuta `17_eliminar_insumo.sql` en Supabase. Solo un administrador puede eliminar un insumo sin compras relacionadas; los insumos usados en compras permanecen para proteger el historial.

Para habilitar **Eliminar cuenta** en Usuarios del Sistema, ejecuta `18_eliminar_usuario.sql` en Supabase. No permite eliminar la sesión propia ni cuentas vinculadas a asistencias, ventas, turnos, compras o pagos; en esos casos desactiva la cuenta para preservar el historial.
