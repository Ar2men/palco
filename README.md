# Palco

Tu palco para el fútbol: solo tus ligas, en tu orden.

Tus ligas de fútbol: marcadores en vivo, próximos partidos, tablas, eventos, estadísticas y alineaciones.
Sin anuncios, sin apuestas, sin cuenta.

Es una **PWA** (app web instalable). La publicas gratis con GitHub Pages y la instalas en tu teléfono
desde el navegador. No necesitas App Store, cuenta de desarrollador de Apple ($99/año), Mac ni volver a firmarla cada 7 días.

## 1. Subirla a GitHub (una sola vez)

1. Crea un repositorio en github.com, por ejemplo `palco`. Puede ser público o privado (Pages en repos privados requiere GitHub Pro).
2. Sube el contenido de esta carpeta:
   ```powershell
   git init; git add .; git commit -m "Palco"; git branch -M main
   ```
   ```powershell
   git remote add origin https://github.com/TU_USUARIO/palco.git; git push -u origin main
   ```
3. En el repo, ve a **Settings → Pages → Build and deployment → Source: Deploy from a branch**, elige `main` y `/ (root)`, y dale **Save**.
4. En ~1 minuto tu app queda en `https://TU_USUARIO.github.io/palco/`.

## 2. Instalarla en el teléfono

**iPhone (Safari):** abre la URL → botón **Compartir** → **Agregar a pantalla de inicio** → **Agregar**.
**Android (Chrome):** abre la URL → menú **⋮** → **Instalar app** (o *Agregar a pantalla principal*).

Se abre a pantalla completa, con su propio ícono, como una app normal.

## 3. Actualizarla

Edita los archivos, haz `git push` y espera ~1 minuto. Para ver la versión nueva, cierra la app y vuelve a abrirla.

## Analista IA (pestaña "Analista")

Un chat que analiza tus partidos al estilo Prisma: probabilidades, cuota justa, valor frente a los momios y una opción de
bajo riesgo y una arriesgada. Usa **Gemini (`gemini-3.8-flash`) en su capa gratis**: no cuesta nada.
Quien use la app **no pone ninguna clave**: la IA corre en un servidor propio (carpeta `worker/`, Cloudflare Workers, gratis)
que guarda la clave de Gemini como secreto. La app nunca la ve.

Límites de la capa gratis:
- **Sin búsqueda en internet** (la búsqueda de Google no es gratis en los modelos actuales). Para compensar, Palco le manda
  los datos reales de ESPN: forma, tabla, cara a cara, momios de DraftKings, goleadores y alineaciones.
  Lo que no está en esos datos (lesiones, córners, tarjetas) lo marca como "sin dato".
- Cuota diaria limitada por Google; si se acaba, el analista deja de responder hasta el día siguiente.
- Google puede usar las conversaciones de la capa gratis para mejorar sus productos.

Publicar el servidor (una sola vez, desde la carpeta `worker/`):
```powershell
npm install
```
```powershell
npx.cmd wrangler login
```
```powershell
npx.cmd wrangler deploy
```
```powershell
npx.cmd wrangler secret put GEMINI_API_KEY
```
La clave gratis se crea en **aistudio.google.com → Get API key**. Pégala cuando la pida el último comando, no en el código.

## Probarla en tu computadora

```powershell
python -m http.server 8765
```
Abre http://localhost:8765. Para la prueba de la lógica: `node lib.test.mjs`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura, barra superior y pestañas |
| `app.js` | Pantallas: Partidos, Próximos, Tablas, Partido y Ajustes |
| `lib.js` | Lógica pura (fechas, formato de datos), probada en `lib.test.mjs` |
| `styles.css` | Diseño (colores en `:root`) |
| `sw.js` | Funciona sin conexión con los últimos datos |
| `icons/make_icons.py` | Regenera los íconos PNG |
| `replica/` | Investigación de reseñas de la app original y plan de cambios (`fixes.md`) |

Para agregar otra liga, añádela en `LEAGUES` dentro de `lib.js`. El código de ESPN de la liga aparece en la URL de
espn.com/futbol (por ejemplo `mex.1`, `eng.1`, `uefa.champions`).

## Límites que debes conocer

- **Los datos vienen de la API pública de ESPN, que no es oficial ni está documentada.** Funciona sin clave, pero
  ESPN puede cambiarla en cualquier momento (ya dejó de aceptar rangos de fechas). Si un día no carga nada, lo más
  probable es eso: hay que ajustar `app.js`.
- **No hay notificaciones push de goles.** Necesitarían un servidor siempre encendido, y quedó fuera de esta versión.
- Los marcadores en vivo se actualizan cada 30 segundos mientras la app está abierta.
