# My Journal

App web personal (mobile-first): registro de hábitos, stats, colección de juegos,
música, miscelánea y notas. Sitio estático en JS vanilla (sin build) +
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
| `notes/{id}` | `{ text, createdAt }` — el título se deriva del texto |
| `games/{id}` | `{ title, coverUrl, releaseDate, platform, genre, status: "owned"\|"wishlist", addedAt }` |
| `music/{id}` | `{ title, artist, coverUrl, releaseDate, genre, type: "album"\|"ep"\|"single", status: "listened"\|"pending", addedAt }` |
| `misc/{id}` | `{ kind: "image"\|"link", imageUrl?, ratio?, url?, title?, note?, createdAt }` |
| `miscImages/{id}` | `{ data }` — imagen completa |
| `activity/{id}` | `{ kind, text, at, img?, emoji? }` — actividad reciente que se muestra en Inicio |

**Imágenes de Miscelánea:** Firebase Storage ya no está incluido en el plan
Spark, así que las capturas se comprimen en el navegador (WebP, < ~900 KB) y
se guardan en Firestore. `misc/{id}.imageUrl` guarda la miniatura (para que el
grid cargue rápido) y `miscImages/{id}.data` la versión completa, que se baja
solo al abrir la imagen.

## Dónde tocar

- `public/js/habits.js`: hábitos, qué hábito suma a qué stat y la regla de la racha.
- `public/js/views/home.js`: saludo y textos del footer (día y noche).
- `public/js/lib/sky.js`: el arte dithered del sol y la luna.
- `public/css/styles.css`: tokens de color y tipografía (`:root`). JetBrains Mono es la mono compartida (navegación, números y fechas). Cada apartado tiene su propia fuente, definida en las variables `--f-*`: Inicio usa Georgia (Gelasio en Android), Registro Instrument Sans, Stats Teko, Colección Bebas Neue, Música SF Pro o Inter, Notas Literata y Miscelánea Special Elite. El bloque "TIPOGRAFÍA Y DISEÑO POR APARTADO", al final del CSS, aplica cada fuente solo dentro de su sección.
- `public/js/lib/activity.js`: textos del registro de actividad.

## Licencia

[MIT](LICENSE) © 2026 J4NDR0S34N. Podés usar, copiar, modificar y
distribuir el código, manteniendo el aviso de copyright y la licencia.
