# Qué arreglar respecto a SofaScore (clon personal, solo fútbol)

**Muestra:** 116 reseñas reales de 2 tiendas, revisadas el 2026-11-23.
- App Store: 60 reseñas, las 10 que muestra cada tienda (EE.UU., Reino Unido, Canadá, Australia, México y España). Las fechas van de 2019 a 2026.
- Google Play: 56 de ~140 visibles (todas de 2026). **Elegidas a mano**: me quedé con las que dicen algo concreto, así que hay sesgo hacia reseñas negativas.
- Fuentes que no se pudieron usar: el feed RSS de Apple (vino vacío), Trustpilot (bloqueo anti-bot 403) y Hacker News (3 menciones de pasada, sin opiniones del producto). No revisé Reddit.
- Los conteos de abajo se obtuvieron con regex sobre `reviews.csv`. La tabla automática está en `feedback.md`.

Las citas son literales. Las de App Store enlazan a la reseña; las de Google Play enlazan a la ficha, porque la Play Store no da un link por reseña.

## 1. Lo que odian

| # | Problema | Reseñas | Fuentes | Cita |
|---|---|---|---|---|
| 1 | Anuncios a pantalla completa que no se pueden saltar | 39 | 6 | "Es más anuncio que aplicación" ([mx](https://apps.apple.com/mx/app/id1176147574?see-all=reviews#review-14461769767)) · "full screen ads that can't be closed even after trying to dismiss them for minutes" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) |
| 2 | Mis ligas y equipos ya no quedan arriba; meten ligas que no me interesan | 22 | 6 | "I can't even keep the prem scores at the top any more" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) · "All favourited leagues I had are no longer available in one screen" ([ca](https://apps.apple.com/ca/app/id1176147574?see-all=reviews#review-13285102785)) |
| 3 | Cada actualización cambia el diseño y lo empeora | 30 | 5 | "simplicity is so much better" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) |
| 4 | El widget de inicio ahora solo muestra los partidos de hoy | 13 | 4 | "now I can't even see tomorrow's fixture" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) |
| 5 | Cuotas y apuestas metidas en todas partes | 7 | 4 | "Forcing me to swipe past an entire screens worth of odds just so I can find out what the lineups are" ([gb](https://apps.apple.com/gb/app/id1176147574?see-all=reviews#review-12407842860)) |
| 6 | Pantallas en blanco o "no hay partidos hoy" cuando sí hay | 7 | 2 | "the app tells me that there are no matches today" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) |
| 7 | Notificaciones de goles falsos o que llegan antes que la transmisión | 6 | 2 | "Incorrectly sends notifications for a goal that never happened" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) |
| 8 | Estadísticas de jugador ahora cobradas *(dato flojo: 1 sola fuente)* | 7 | 1 | "lock the \"player stats\" section behind a paywall" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) |
| 9 | Menú de cookies con más de 130 interruptores; con VPN la app no funciona *(dato flojo)* | 3 | 1 | "Over 130 taps just to say NO" ([play](https://play.google.com/store/apps/details?id=com.sofascore.results&hl=en_US&showAllReviews=true)) |

## 2. Lo que falta (lo piden por nombre)

- **Abrir siempre en el día de hoy.** Hoy se queda en la fecha que dejaste la última vez (1 reseña, [ca](https://apps.apple.com/ca/app/id1176147574?see-all=reviews#review-8296656673)).
- **Partidos ordenados por liga y por hora**, no en orden cronológico obligatorio (2 reseñas, [es](https://apps.apple.com/es/app/id1176147574?see-all=reviews#review-13260875530)).
- **Forma reciente y posición en la tabla visibles desde la lista** de partidos (1 reseña, Play).
- **Tabla jornada por jornada** (1 reseña, Play).
- **Retrasar o silenciar notificaciones** para no spoilearte el gol (2 reseñas, Play).
- **Formato de 12 horas** (1 reseña, Play).

Todos son datos flojos (1 o 2 reseñas), pero son baratos y encajan con el uso personal.

## 3. Lo que nadie resuelve (posicionamiento)

- **El aficionado de fútbol que no apuesta.** SofaScore se ve como una app multideporte con apuestas. Un usuario dice que alguien en recuperación "basically can't use this app anymore" ([gb](https://apps.apple.com/gb/app/id1176147574?see-all=reviews#review-12407842860)).
- **El que solo sigue 3 o 4 ligas.** La app está hecha para "todo". La queja es "PLZ ALLOW USERS TO SEE ONLY WHAT THEY CARE ABOUT AND HIDE THE REST" (Play).
- Un usuario de Play escribió que los anuncios lo llevaron a "write my own little website just to get the info". Es justo lo que vas a hacer tú.

## 4. Plan de cambios (para tu app)

| Cambio | Tamaño | Evidencia | Estado |
|---|---|---|---|
| Sin anuncios, sin cuotas, sin chat, sin cuenta y sin cookies | S (no se programa nada) | #1, #5, #9 | ✅ en el MVP |
| "Mis ligas": eliges tus ligas y las ordenas; siempre salen en ese orden, arriba | S | #2 | ✅ en el MVP |
| Abre siempre en HOY, con una barra de días para ir atrás y adelante | S | Falta: "abrir en hoy" | ✅ en el MVP |
| Pestaña "Próximos": los partidos de tus ligas en los próximos 7 días, no solo hoy | S | #4 | ✅ en el MVP |
| Partido: eventos (goles y tarjetas), estadísticas y alineaciones, todo gratis | M | #8 | ✅ en el MVP |
| Tabla de posiciones por liga | S | Falta: forma y tabla | ✅ en el MVP |
| Modo "sin spoilers" (oculta los marcadores) | S | #7, falta: retrasar notificación | ✅ en el MVP |
| Diseño propio y estable que no cambia con cada actualización | — | #3 | Lo decides tú |
| Notificaciones push de gol | L (necesita un servidor) | #7 | ⏳ después |
| Tabla jornada por jornada | M | Falta | ⏳ después |

## 5. Ángulo

Como es para uso personal, el ángulo te sirve de **regla de diseño**, no de marketing:

> Para el aficionado que solo sigue sus ligas y está harto de anuncios y apuestas,
> **la app** muestra solo sus partidos, en su orden, sin nada más.
> Evidencia: anuncios (39 reseñas, 6 fuentes) + mis ligas arriba (22 reseñas, 6 fuentes).

Otras opciones: (b) "estadísticas completas gratis" (dato flojo, 1 fuente) y (c) "sin apuestas" (7 reseñas, 4 fuentes). Recomiendo la (a), porque las otras dos quedan incluidas.

No uses "SofaScore" en el nombre, el logo ni los colores de tu app.
