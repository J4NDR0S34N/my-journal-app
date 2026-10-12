# Cambios

Las versiones son etiquetas de git (`v0.10`, `v0.50`, …).

## v0.50

### Inicio
- Los hábitos se marcan en Inicio: grilla de 3×3 con **Guardar** debajo (antes
  estaban en la sección Registro, que ya no existe).
- **Progreso** vive en Inicio, al lado de "Hoy": actividad por intensidad en
  vistas Semana, Mes y Año, con flechas para moverse. Tocar un día permite
  editarlo. La **racha** ("🔥 N días") está en el encabezado de Progreso.
- "Hoy", "Progreso" y "Actividad reciente" son tarjetas de vidrio al mismo
  margen. Actividad reciente muestra solo lo de hoy.
- Saludo con el nombre de la cuenta de Google, hora que cambia justo con el
  minuto y temperatura local (Open-Meteo, con la ubicación del dispositivo).
- **Cielo nuevo** en estilo "preserving renders": puntos con dithering y
  estelas, en un solo color.

### Personalización (panel del perfil)
- **Ilustración** del cielo con miniaturas animadas, guardada en la cuenta y
  sincronizada entre dispositivos:
  - Día: Soleado + nubes, Soleado despejado.
  - Noche: Luna + cometas, Nocturno despejado, Saturno (anillos con la
    división de Cassini, sombras y Titán) y Marte (Syrtis Major, Valles
    Marineris, casquetes polares, polvo, Fobos y Deimos).

### Navegación
- Íconos en el menú (Inicio, Colección, Miscelánea, Notas) con
  **microanimaciones** propias: el techo y la puerta de Inicio, las páginas
  de Colección, las estrellas de Miscelánea, las líneas de Notas. Se animan
  al pasar el cursor, al tocarlos y al entrar a la sección.
- Con el menú cerrado los íconos quedan a la vista: **barra abajo** en el
  celular (se desliza de lado si hay muchos) y **columna a la izquierda** en
  escritorio, centrada en alto.
- El logo de espiral abre el menú completo, con entrada y salida más fluidas.
  El botón muestra la sección actual.

### Módulos propios
- Burbuja **+** pegada a la barra de íconos: crea un módulo con nombre, ícono
  (12 a elegir) y plantilla. Por ahora solo "En blanco" (texto libre que se
  guarda solo); Lista, Galería y Tabla figuran como "próximamente".
- Los módulos aparecen en la barra, la columna y el menú, se editan o borran
  desde su página y se sincronizan en vivo (`modules`, ruta `#/m/{id}`).

### Diseño
- Rediseño completo: 3 tipografías (Gelasio, Inter, JetBrains Mono) y 3
  colores (papel, tinta, gris). Solo Inicio tiene fondo propio.
- Tema claro, oscuro o automático (por hora); movimiento completo o quieto.
- Vidrio esmerilado en el menú y las hojas, ✕ para cerrar, atajos de teclado
  según el dispositivo.
- Logo nuevo (espiral de puntos) en la pestaña, el celular y el menú.
- Burbuja del perfil arriba a la derecha con la cuenta, cambiar de cuenta,
  ajustes y cerrar sesión. Pulso al tocar el logo y la burbuja en el celular.

### Datos y funcionamiento
- **Tiempo real**: lo que cambia en otro dispositivo aparece solo.
- Funciona sin conexión (service worker con red primero y Firestore offline).
- Colección como portal: Videojuegos, Música y colecciones propias, con reglas
  y pruebas en el emulador. Música con filtro y tres vistas.
- Notas con título propio.

### Quitado
- Vibración háptica (y su ajuste).
- Secciones Registro y Progreso del menú (su contenido está en Inicio) y la
  pregunta del día.

## v0.10
- Acceso para varias personas: cada cuenta de Google tiene su propio diario
  privado (`users/{uid}/…`); el dueño sigue en la raíz.
- Música más completa (canciones del disco con fragmentos, portadas desde
  Deezer) y carga más rápida.
