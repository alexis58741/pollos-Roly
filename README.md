# Pollos Roly

Panel de administrador conectado a Supabase Auth y PostgreSQL, desarrollado con Next.js, React y TypeScript. Moneda: bolivianos. Zona horaria: America/La_Paz.

## Ejecutar

```powershell
npm install
npm run dev
```

Abre http://127.0.0.1:3001/admin/dashboard.

## Incluye

- Resumen calculado con los pedidos de Supabase; filtros por sucursal y período.
- Consulta de pedidos, actualización del estado y exportación CSV.
- Alta y edición de productos con descripción, precios regular/oferta, fotografía, orden y disponibilidad. Pollos incluye selección de presas y acompañamientos y tipos de presas independientes del precio. Requiere la migración `database/03_productos_pollos.sql`.
- Menú con pestañas Platos y productos / Categorías. Alta independiente, edición, búsqueda, archivo y reactivación de categorías desde tarjetas. Las categorías con productos no se archivan y Snacks conserva su nombre si tiene inventario asociado.
- Alta y ajuste manual de inventario con alertas de stock mínimo por sucursal.
- Registro y edición de personal y sucursales.
- Configuración de datos del negocio.
- Diseño adaptable a computadora y celular, en español y bolivianos.
- Caja: apertura, ingresos/retiros, esperado, cierre contado, diferencias e historial.
- Avisos: creación, edición, prioridad, sucursal y publicación/archivo.
- Snacks: cantidades y mínimos por producto y sucursal, alertas y exportación.
- Proveedores y compras: registro de varios insumos por compra, proveedor opcional, comprobante, subtotales, total y observaciones. Alta de insumos nuevos e inventario en una transacción; anulación conjunta. Requiere `database/04_compras_multiples.sql`.
- Reportes: ventas por método/sucursal y balance operativo con filtros de fechas y exportación.
- Usuarios del Sistema: edición de perfiles, contacto, sucursal, rol y estado. Las cuentas nuevas se crean en Supabase Authentication y aparecen al actualizar.
- Pagos al Personal: pendientes editables y comprobantes pagados inmutables.
- Ingreso / Egreso: movimientos adicionales, filtros y balance.
- Mi Perfil: datos del administrador autenticado.

## Conexión, acceso y datos

La URL y la clave pública de Supabase están en `.env.local`, excluido de Git. No se usa `service_role`. Para otro equipo, copia `.env.example` a `.env.local` y completa los valores. Reinicia el servidor después de cambiar el entorno.

Inicia sesión en `/login` con una cuenta de Supabase Auth y un perfil activo. Administrador entra al panel, Cajero al punto de venta `/cajero` y los demás roles operativos al registro de asistencia. `proxy.ts`, los layouts y las operaciones del servidor verifican la cuenta y el rol. No puedes quitarte tu propio acceso de administrador desde Usuarios del Sistema.

Los módulos leen y guardan datos reales en Supabase. Los ejemplos anteriores del navegador quedan sin usar y no se importan automáticamente. Un error de carga nunca se sustituye con datos ficticios. La base puede comenzar vacía: crea primero tu sucursal. Compras, anulaciones, caja y estados de pedidos usan las funciones SQL transaccionales. Después de guardar se vuelve a leer la base; un resultado incierto exige actualizar antes de repetir el registro.

La base se instala con `database/01_pollos_roly.sql`, con RLS, restricciones y funciones atómicas. La activación inicial del administrador está en `database/02_primer_administrador.sql`. Después ejecuta `database/03_productos_pollos.sql` para el formulario completo y Storage, y `database/04_compras_multiples.sql` para compras con varios insumos. `database/05_roles_usuarios.sql` permite además los roles Cocinero, Mesero, Repartidor y Limpieza en perfiles de usuario. En la base existente ejecuta las actualizaciones pendientes; no vuelvas a instalar 01. Sigue `database/LEEME.md`. La configuración actual ya está conectada al proyecto indicado por el usuario. No hay conexión al sistema Pollos Qué Delicia.

Cada compra puede agrupar varios insumos. Caja es independiente de compras, nómina y finanzas; registrar un pago no crea un retiro automático. El balance operativo no equivale a utilidad contable. Las correcciones de pagos realizados y finanzas se registran como contrapartidas. El futuro POS dispone de una función SQL para pagos mixtos y descuento de snacks; recetas y consumo automático de insumos no forman parte de esta etapa.

## Validación

```powershell
npm run typecheck
npm run build
npm run test
# Motor SQL de pruebas independiente (una vez)
npm install --prefix tests/sql-runtime
npm run test:db
```

Las pruebas SQL usan PostgreSQL embebido con Auth simulado. También se comprobó el proyecto real: acceso autenticado, lectura del panel, bloqueo anónimo y guardado/recarga/restauración de configuración. `npm run check:connection` verifica Auth y el bloqueo anónimo sin pedir contraseñas. Los cálculos contemplan pagos mixtos, fechas de Bolivia y las cifras guardadas al cerrar un turno.
