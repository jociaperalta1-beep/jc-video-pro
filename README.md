# JC VIDEO PRO — Primera versión funcional

Editor de video real para **web y Android (PWA)** con marca propia. Esta entrega corresponde a las fases 1 a 7 del proyecto: pantalla y editor, importación, línea de tiempo multipista, edición, textos, filtros, exportación real, proyectos guardados y estructura de planes Premium.

> Importante: no hay funciones simuladas. Lo que no está terminado aparece marcado como **pendiente** (IA, anuncios, pagos, nube y APK). Los botones de planes son una **demo local** y no cobran dinero.

---

## 1. Cómo abrir la aplicación (sin comandos complicados)

1. Abre la carpeta `JC_VIDEO_PRO` en el escritorio.
2. Haz **doble clic en `INICIAR.bat`**.
3. Se abrirá solo `http://localhost:8123` en tu navegador.
4. Deja la ventana negra abierta mientras trabajas. Para cerrar, ciérrala o pulsa `Ctrl + C`.

> La versión web necesita un mini servidor local porque usa módulos de JavaScript. No requiere Internet, ni cuentas, ni pagos, ni instalar programas adicionales (usa Python o Node si ya están instalados; el archivo lo detecta solo).

**Navegadores recomendados:** Chrome o Edge actualizados en computadora y Android. La exportación en vivo funciona mejor en Chrome/Edge.

---

## 2. Qué ya funciona de verdad

| Función | Estado |
|---|---|
| Interfaz oscura violeta/azul, adaptable a celular y PC | ✅ Funcional |
| Importar videos, fotos y audios desde el dispositivo | ✅ Funcional |
| Biblioteca local con miniaturas | ✅ Funcional |
| Línea de tiempo multipista (video, superposición, texto, audio) | ✅ Funcional |
| Mover clips y recortar por ambos bordes | ✅ Funcional |
| Dividir, duplicar y eliminar clips | ✅ Funcional |
| Reproducción real con imagen y sonido sincronizados | ✅ Funcional |
| Textos animados (fundido, deslizar, zoom) | ✅ Funcional |
| Filtros de color y ajustes de brillo, contraste, saturación | ✅ Funcional |
| Velocidad, volumen y fundidos por clip | ✅ Funcional |
| Formatos 9:16, 16:9, 1:1 y 4:5 | ✅ Funcional |
| Exportación real de video (720p / 1080p / 4K Premium) | ✅ Funcional (WebM o MP4 según el navegador) |
| Guardar fotograma PNG | ✅ Funcional |
| Proyectos guardados en el navegador (IndexedDB) | ✅ Funcional |
| Deshacer / rehacer | ✅ Funcional |
| PWA instalable en Android (Chrome → Instalar aplicación) | ✅ Funcional |
| Panel de administración local (planes, precios, proyectos) | ✅ Funcional (local) |
| Subtítulos automáticos, quitar fondo, mejora IA | ⏳ Pendiente (fase futura) |
| Anuncios AdMob / web | ⏳ Pendiente |
| Pagos reales Premium / Binance / Payoneer | ⏳ Pendiente |
| Cuentas de usuario y sincronización en la nube | ⏳ Pendiente (requiere backend) |
| APK de Android con Capacitor | ⏳ Pendiente (fase 8) |
| Música libre de derechos integrada y grabación de voz | ⏳ Pendiente |

### Límites actuales (sin engaños)
- **Exportación:** usa `canvas.captureStream()` + `MediaRecorder`, así que graba **en tiempo real** (un video de 1 minuto tarda ~1 minuto). El formato depende del navegador: Chrome de escritorio suele generar **MP4 (H.264)** y, si no puede, la app cambia automáticamente a **WebM**. El audio del MP4 de Chrome puede quedar en **Opus**; si una red social no lo acepta, habrá que convertirlo (la conversión automática con FFmpeg.wasm se añadirá después).
- **Primera exportación:** Chrome prepara el grabador antes de empezar; por eso la primera vez puede tardar unos segundos extra. La app muestra el progreso y avisa si el archivo sale vacío.
- **Marca de agua:** el plan Gratis exporta con la marca «JC VIDEO PRO». Premium la quita.
- **Todo es local:** los proyectos y archivos viven en este navegador. Si borras los datos del navegador, se pierden.
- **IA:** no está implementada; se muestra como pendiente a propósito.
- **Pagos:** los botones Premium son una demo local sin cobro.

---

## 3. Uso rápido del editor

1. **Importa**: arrastra un video/foto/música al área central o pulsa «Importar archivos».
2. **Coloca** el clip en la línea de tiempo desde el panel Medios (+ Pista o Sup.).
3. **Edita**:
   - Arrastra el clip para moverlo.
   - Arrastra los bordes para recortar.
   - `Dividir` corta en la posición del cursor.
   - Selecciona el clip y ajusta color, escala, velocidad, volumen o texto en **Propiedades**.
4. **Texto**: pestaña Texto → elige un estilo → edítalo en Propiedades.
5. **Exporta**: botón Exportar → resolución → «Exportar video». Se descargará al terminar.

En pantallas medianas y pequeñas, el botón **⋮** de la barra superior abre el menú con Nuevo, Abrir, Guardar, Deshacer/Rehacer, Premium y Admin. Los botones de la barra inferior (Medios, Texto, Audio, Filtros, IA) abren el panel lateral.

**Atajos de teclado**
- `Espacio`: reproducir / pausar
- `S`: dividir en el cursor
- `Supr`: eliminar clip seleccionado
- `Ctrl + Z` / `Ctrl + Shift + Z`: deshacer / rehacer
- `Ctrl + S`: guardar
- `Ctrl + E`: exportar
- `←` / `→`: mover 1 segundo (`Shift` = 5 segundos)

---

## 4. Planes y panel de administración

- Abre `admin.html` desde el botón **Admin** del editor.
- Código inicial: **`jcadmin`** (cámbialo en «Cuenta y seguridad local»).
- Puedes cambiar precios, aplicar un plan de prueba, guardar IDs de AdMob (sin conectar), ver/eliminar proyectos, descargar una copia JSON y borrar los datos locales.

> El panel es local y honesto: no hay usuarios remotos, suscripciones ni ingresos de anuncios porque todavía no existe backend ni SDK de anuncios conectado.

---

## 5. Instalar en Android como aplicación (PWA, gratis)

1. Sirve la carpeta desde una URL (para pruebas locales puede ser la misma computadora en la red).
2. En Chrome Android abre esa URL.
3. Menú ⋮ → **Instalar aplicación** / **Añadir a pantalla de inicio**.
4. Se abrirá a pantalla completa como una app.

La PWA funciona offline para la interfaz. Los archivos multimedia se guardan en el almacenamiento del navegador del teléfono.

### APK real (fase 8, pendiente)
Para generar un `.apk` no se necesita comprar nada: se usa **Capacitor** (gratuito) y **Android Studio** (gratuito). Requiere instalar esas herramientas en la computadora. No está incluido todavía porque la app web debe estabilizarse primero. Si quieres, en la próxima etapa preparo el proyecto Capacitor y la guía paso a paso.

---

## 6. Estructura del proyecto

```
JC_VIDEO_PRO/
├─ index.html              Editor principal
├─ admin.html              Panel de administración local
├─ manifest.webmanifest    Configuración PWA
├─ sw.js                   Service Worker (offline)
├─ INICIAR.bat             Abre el editor con doble clic
├─ css/app.css             Diseño oscuro violeta/azul y responsive
├─ assets/                 Iconos de la marca
└─ js/
   ├─ core.js              Estado, modelo de proyecto, historial, filtros
   ├─ storage.js           IndexedDB (proyectos, medios, ajustes)
   ├─ ui.js                Modales, avisos, confirmaciones
   ├─ media.js             Importación y miniaturas
   ├─ renderer.js          Reproducción, dibujo del lienzo y audio
   ├─ timeline.js          Línea de tiempo multipista e interacciones
   ├─ inspector.js         Propiedades del clip
   ├─ panels.js            Medios, texto, audio, filtros e IA
   ├─ premium.js           Planes y estado Premium local
   ├─ exporter.js          Exportación real y fotogramas PNG
   └─ admin.js             Lógica del panel de administración
```

---

## 7. Privacidad

- No se sube nada a Internet.
- No hay rastreo, cuentas ni anuncios en esta versión.
- Los datos quedan en IndexedDB/localStorage de tu navegador.
- Los archivos importados nunca salen del dispositivo.

---

## 8. Siguientes pasos recomendados

1. Probar la exportación en Chrome de escritorio y en Android.
2. Corregir detalles de usabilidad que aparezcan en pruebas reales.
3. Integrar conversión MP4 con FFmpeg.wasm (o empaquetar FFmpeg en Android).
4. Añadir grabación de voz y música libre.
5. Preparar backend gratuito para cuentas y sincronización (por ejemplo Supabase/Cloudflare).
6. Integrar AdMob y facturación real.
7. Construir el APK con Capacitor y publicar.

Cada fase se conserva y se amplía sobre lo ya construido.
