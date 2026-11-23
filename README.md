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

Un chat que analiza tus partidos como Prisma: busca en la web forma, bajas y momios, y responde con probabilidades,
cuota justa y una opción de bajo riesgo y una arriesgada. Usa **Claude Opus 5.5** con búsqueda web.
Quien use la app **no pone ninguna clave**: la IA corre en un servidor propio (carpeta `worker/`, Cloudflare Workers, gratis)
que guarda la clave de Anthropic como secreto. La app nunca la ve.

Publicar el servidor (una sola vez, desde la carpeta `worker/`):
```powershell
npm install
```
```powershell
npx wrangler login
```
```powershell
npm run deploy
```
```powershell
npx wrangler secret put ANTHROPIC_API_KEY
```
El último comando te pide la clave (créala en console.anthropic.com → API Keys); pégala ahí, no en el código.
`npm run deploy` te da una URL `https://palco-ia.<tu-subdominio>.workers.dev`: ponla en `AI_URL` dentro de `app.js`.

**Cuesta dinero por uso**, a tu cuenta de Anthropic: unos centavos de dólar por respuesta con búsquedas.
Pon un límite de gasto mensual en la consola de Anthropic: es el tope real. El servidor solo acepta peticiones
desde tu página y máximo 6 preguntas por minuto por persona.

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
