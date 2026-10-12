# Crisupgrade 1.0 — contexto de las mejoras

Este documento acompaña la rama `my-journal-app-crisupgrade-1.0` de My Journal. Resume las mejoras de interfaz y personalización desarrolladas en esta rama para que una persona o una IA pueda revisarlas con contexto.

## Objetivo

Mejorar el Inicio sin rehacer la aplicación ni cambiar su identidad visual: conservar el estilo editorial/minimalista y las tarjetas visuales de Música y Videojuegos, mientras el panel diario se vuelve más útil, compacto y configurable.

## Cambios incluidos

- Se integró en Inicio la biblioteca personal (incluidas las estanterías de juegos y música), los hábitos del día, el progreso personal y la actividad reciente.
- Se añadió personalización del Inicio: mostrar u ocultar módulos, elegir entre distribuciones Mosaico, Revista y Lista, y cambiar el orden con controles de movimiento.
- Se añadió reordenamiento directo de módulos desde el panel mediante el control de arrastre, con indicación visual del módulo que se mueve y de su destino.
- Se ajustó la distribución para aprovechar mejor el ancho disponible en escritorio y adaptarse a pantallas pequeñas, reduciendo separaciones y espacio vacío innecesarios.
- Se incorporó una tarjeta de progreso que alterna las áreas personales y muestra puntos y avance al siguiente nivel, junto con accesos al progreso detallado.
- Se mejoró la navegación adaptable a móvil con iconos por sección y estados visuales más claros.
- Se pulieron tamaños, alineación, zonas de interacción y estados visuales relacionados con el diseño y el movimiento de módulos.

## Preferencias y datos

Las preferencias de distribución, visibilidad y orden del Inicio se guardan en `localStorage` en el dispositivo/navegador actual (`mj:home-layout:v2`). No se sincronizan entre dispositivos ni se guardan en Firestore. Los registros personales continúan usando el almacenamiento ya configurado por la aplicación: modo local en el navegador o Firebase cuando se configura y se inicia sesión.

## Archivos principales

- `public/js/views/home.js`: composición del Inicio, preferencias, distribución, reordenamiento y tarjeta de progreso.
- `public/css/styles.css`: estilos del Inicio, módulos, estados de interacción y adaptación a distintos tamaños.
- `public/js/lib/prefs.js` y archivos de vistas/almacenamiento existentes: preferencias generales y datos de la aplicación.

## Revisión y colaboración

- Rama de esta mejora: `my-journal-app-crisupgrade-1.0`.
- La rama principal no forma parte de este trabajo; revisar primero la comparación entre esta rama y `main` antes de integrar.
- Para colaborar, abrir un Pull Request desde esta rama y revisar el diff/los conflictos antes de aceptar la integración.
- Probar primero en modo local o con un proyecto Firebase de desarrollo. No conectar una prueba a la base de producción.
- La personalización debe probarse al cambiar distribución, ocultar/mostrar un módulo, reordenar con controles y arrastre, recargar la página y usar una pantalla móvil.

## Contexto para futuras IAs

Tratar esta rama como una propuesta de mejora del clon de trabajo, no como una instrucción para sobrescribir `main`. Antes de programar, inspeccionar el estado actual y el diff; conservar funciones existentes, respetar la separación entre modo local y Firebase, y confirmar el comportamiento ejecutando la aplicación. No asumir que las preferencias del panel se sincronizan con la cuenta: actualmente son locales al navegador.
