# My Journal

App web personal (mobile-first): hábitos del día y progreso (en Inicio), colecciones
(videojuegos, música y las que crees), miscelánea y notas. Sitio estático en JS vanilla (sin build) +
Firebase (Firestore, Auth y Hosting en el plan gratuito Spark).

## Probar en local

Sin configurar nada, la app corre en **modo local** (guarda en `localStorage`).

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Abrí http://localhost:5500

## Puesta en marcha con Firebase

1. **Crear el proyecto** en https://console.firebase.google.com (plan Spark).
2. **Registrar una app web** (ícono `</>`) y copiar `apiKey`, `authDomain`,
   `projectId` y `appId` en `public/js/config.js`.
3. **Firestore Database** → *Crear base de datos* → modo producción.
4. **Authentication** → *Sign-in method* → habilitar **Google**.
5. **RAWG**: registrarse en https://rawg.io/apidocs y pegar la key en
   `RAWG_KEY` (`public/js/config.js`).
6. **Firebase CLI** (requiere Node.js LTS):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
   Poné tu project ID en `.firebaserc` y publicá:
   ```bash
   firebase deploy
   ```
7. **Definir al dueño**: entrá a la app con Google y copiá tu UID (Firebase
   Console → Authentication → Users) en `OWNER_UID` (`public/js/config.js`) y
   en `isOwner()` (`firestore.rules`). Después publicá:
   ```bash
   firebase deploy --only firestore:rules,hosting
   ```

## Acceso (varias personas)

Cualquiera con una cuenta de Google puede entrar y tiene **su propio diario,
privado**. El dueño guarda sus datos en las colecciones de la raíz; el resto,
en `users/{uid}/…` (mismas colecciones). Las reglas de Firestore impiden que
una cuenta lea o escriba el diario de otra, incluido el dueño.

## Datos (Firestore)

Rutas del dueño; para el resto de las cuentas, anteponé `users/{uid}/`.

| Colección | Documento |
|---|---|
| `days/{YYYY-MM-DD}` | `{ h: { gym, run, gaming, hydration, rest, projects, reading, drawing, movies } }` |
| `notes/{id}` | `{ title?, text, createdAt }` — sin título propio, se muestran las primeras palabras del texto |
| `games/{id}` | `{ title, coverUrl, releaseDate, platform, genre, status: "owned"\|"wishlist", addedAt }` |
| `music/{id}` | `{ title, artist, coverUrl, releaseDate, genre, type: "album"\|"ep"\|"single", status: "listened"\|"pending", addedAt }` |
| `misc/{id}` | `{ kind: "image"\|"link", imageUrl?, ratio?, url?, title?, note?, createdAt }` |
| `miscImages/{id}` | `{ data }` — imagen completa |
| `activity/{id}` | `{ kind, text, at, img?, emoji?, route?, where? }` — actividad reciente que se muestra en Inicio |
| `collections/{id}` | `{ name, kind: "games"\|"music"\|"custom", order, createdAt }` — tarjetas del portal de Colección |
| `collectionItems/{id}` | `{ collectionId, title, coverUrl?, note?, status: "owned"\|"wishlist", addedAt }` — ítems de las colecciones genéricas |

**Colecciones:** `collections/videojuegos` y `collections/musica` se crean solas
la primera vez (con una transacción: sin conexión no escriben nada) y solo
apuntan a `games` y `music`, que siguen en su lugar. Renombrar cambia `name`,
nunca rutas ni datos. Las creadas por vos tienen id `c-…` y se pueden borrar
(junto con sus ítems); las de fábrica no.

Rutas: `#/coleccion` (portal), `#/coleccion/videojuegos`,
`#/coleccion/videojuegos/{idJuego}`, `#/coleccion/musica`, `#/coleccion/c-…`.
Los enlaces viejos siguen andando: `#/coleccion/{idJuego}` →
`#/coleccion/videojuegos/{idJuego}`, `#/musica` → `#/coleccion/musica` y
`#/registro`, `#/progreso`, `#/stats` y `#/estadistica` → `#/inicio`. No hay choque posible: los ids automáticos de
Firestore nunca llevan `-`.

**Imágenes de Miscelánea:** Firebase Storage ya no está incluido en el plan
Spark, así que las capturas se comprimen en el navegador (WebP, < ~900 KB) y
se guardan en Firestore. `misc/{id}.imageUrl` guarda la miniatura (para que el
grid cargue rápido) y `miscImages/{id}.data` la versión completa, que se baja
solo al abrir la imagen.

## Pruebas

```bash
cd tests
npm install
npm run test:rules   # reglas de Firestore en el emulador (requiere Java)
npm test             # funciones puras (racha)
```

**Tiempo real:** cada colección que muestra una sección queda escuchando
Firestore (`onSnapshot` en `public/js/store.js`). Si cambia desde otro
dispositivo, la sección se redibuja sola y conserva el scroll. Espera si hay
una hoja o el menú abiertos, o texto sin guardar en un campo.

## Dónde tocar

- `public/js/habits.js`: hábitos y la regla de la racha.
- `public/js/lib/habitPicker.js`: la grilla de hábitos con Guardar.
- `public/js/lib/progress.js`: el cuadro de Progreso de Inicio (actividad por intensidad en vistas Semana, Mes y Año).
- `public/js/views/home.js`: saludo y textos del footer (día y noche).
- `public/js/lib/weather.js`: temperatura local al lado de la hora, de [Open-Meteo](https://open-meteo.com) (gratis, sin clave). Usa la ubicación del dispositivo (pide permiso una vez, redondeada a ~1 km y sin guardarla); si se rechaza, no se muestra.
- `public/js/lib/sky.js`: el cielo dithered de Inicio (sol, nubes, luna, cometas, Júpiter, Marte); también dibuja las miniaturas del perfil.
- `public/js/lib/scenes.js`: la ilustración elegida de día y de noche (personalización del perfil). Se guarda en `settings/ui` y se sincroniza en vivo entre dispositivos.
- `public/css/styles.css`: un solo lenguaje visual. Tokens en `:root`: 3 colores (`--paper` fondo, `--ink` texto y lo activo, `--muted` gris secundario; en modo claro papel y tinta se invierten, y el resto de los tonos son mezclas de esos tres) y 3 tipografías (`--serif` Georgia/Gelasio para títulos, `--sans` Inter para textos y botones, `--mono` JetBrains Mono para datos y navegación). Solo Inicio tiene fondo propio (el cielo).
- `public/js/lib/activity.js`: textos del registro de actividad.
- `public/sw.js`: service worker (la app abre sin conexión). Si agregás un archivo JS, sumalo a `SHELL`.
- `public/js/lib/profile.js`: burbuja del perfil (arriba a la derecha) con la cuenta de Google y los ajustes.
- `public/js/lib/prefs.js` y `luz.js`: ajustes del dispositivo (háptica, movimiento, tema) y la luz del día.

## Licencia

[MIT](LICENSE) © 2026 J4NDR0S34N. Podés usar, copiar, modificar y
distribuir el código, manteniendo el aviso de copyright y la licencia.
