# Marca: Palco

**Palco** es el lugar privado del estadio, desde donde ves el partido sin ruido. Encaja con el ángulo de `fixes.md`: solo tus ligas, en tu orden, sin anuncios ni apuestas.

## 1. Nombre

Los 20 candidatos, por estilo:
- **Descriptivos:** Cancha, Marcador, Jornada, Tabla, MiLiga
- **Compuestos:** Ligamía, Mediocampo, Medio Tiempo, CanchaMía
- **Inventados:** Golvo, Ligaro, Futbo, Canchu
- **Metáfora:** **Palco**, Tribuna, Gradería, Pizarra, Banca
- **Verbo:** Sigue, Checa

Ninguno se parece a "SofaScore" en sonido, forma ni significado.

| Finalista | Por qué sí / por qué no |
|---|---|
| **Palco** ✅ | Dice "tu lugar privado para ver fútbol". Es corto, se escribe como suena y no choca con apps de deportes en la App Store de México. |
| Jornada | Neutral y futbolero, pero no dice nada del ángulo. Existe "Jornada Perfecta Fantasy". |
| Mediocampo | Libre en la App Store, pero en Google Play existe "Medio Campo". |
| Silbatazo | Libre, pero suena a ruido y a árbitro: va contra el ángulo de "sin ruido". |
| Ligamía | Descartado: "ligar" lleva a apps de citas (Play muestra "LigaMe: IA para ligar"). |
| ~~Cancha~~ | El nombre provisional. Descartado: 13 apps de deportes en la App Store MX lo usan. |

### Chequeos de Palco (corridos el 2026-11-23)

| Chequeo | Resultado |
|---|---|
| App Store MX (API de búsqueda de iTunes) | 9 apps con "Palco" en el nombre, **0 en la categoría Deportes** |
| Google Play, "palco futbol" | Existe **"Palco 90: Fútbol Manager"**, un juego de mánager. Es otra categoría, pero el mundo es el mismo: tenlo presente si algún día la publicas. |
| Marca registrada EE.UU. (USPTO, clases 9 y 42) | por correr |
| Marca UE (EUIPO / TMview) | por correr |
| Marca México (IMPI, MARCia) | por correr |
| WIPO Global Brand Database | por correr |
| Dominio | no aplica: vive en `TU_USUARIO.github.io/palco` |
| Usuarios en redes / GitHub | por correr (solo si la vas a compartir) |

Para uso personal estos chequeos son de sobra. **Si algún día la publicas o le cobras a alguien**, corre los de marca registrada y consulta con un abogado de marcas antes de gastar dinero en el nombre.

## 2. Paleta

El original usa azul (≈ `#374df5`, aproximado: no se pudo leer de su sitio). Palco usa **verde césped**, otra familia de color.

| Rol | Claro | Oscuro | Uso |
|---|---|---|---|
| `--turf` césped | `#1f5a3a` | `#1f5a3a` | Marca, botones, día elegido, cabecera del partido |
| `--turf-2` franja | `#256944` | — | Franjas del pasto en la cabecera y el ícono |
| `--chalk` fondo (cal) | `#f5f8f5` | `#0f1c15` | Fondo |
| `--surface` | `#ffffff` | `#16261d` | Barra de pestañas y botones |
| `--ink` tinta | `#14231b` | `#e6efe8` | Texto |
| `--muted` | `#5b6f63` | `#93a89b` | Texto secundario |
| `--live` en vivo | `#8a6400` (antes `#a87a00`, no pasaba) | `#f2c230` | Minuto en vivo |
| `--yellow` tarjeta | `#f2c230` + borde `#8a6400` | `#f2c230` | Tarjeta amarilla, barras de estadísticas |
| `--red` tarjeta | `#d6402b` | `#d6402b` | Solo tarjetas rojas |
| `--focus` | `#14231b` | `#f2c230` | Anillo de foco del teclado |

`contrast.py`: **0 fallas AA** en `design/tokens.json` (claro, 15 pares) y `design/tokens-dark.json` (oscuro, 9 pares).

## 3. Brief del logo

- **Idea:** una P dibujada con la cal de la cancha: la línea central es el palo y medio círculo central es la panza, sobre el pasto con franjas. Es "Palco" visto desde arriba.
- **Tipo:** monograma (P) + logotipo "Palco" en Saira Condensed 700.
- **Tiene que funcionar** a 16 px (favicon: solo la P blanca sobre verde, sin franjas) y como ícono de 1024 px (con franjas).
- **Entregables:** SVG, ícono de app de 1024×1024 sin transparencia (iOS), juego de favicons e imagen social de 1200×630.
- **No debe parecerse al logo de SofaScore:** nada de azul, ni de su forma, ni de su letra. Antes de aprobar un diseño final, ponlo junto al logo de SofaScore y compáralos.
- **Hoy:** hay una versión funcional hecha en código (`icons/icon.svg` y los PNG que genera `icons/make_icons.py`). Si quieres algo más pulido, este brief es lo que le pasas a un diseñador o a un generador de imágenes.

## 4. Voz

| Palabra | Lo que **no** significa |
|---|---|
| **Directa** | No seca: dice qué pasó y qué hacer, sin regañar |
| **Tranquila** | No fría: sin signos de exclamación ni urgencias |
| **Futbolera** | No de casa de apuestas: habla de partidos, nunca de cuotas ni "oportunidades" |

| Sí | No |
|---|---|
| "Tus ligas no juegan este día." | "¡Ups! No encontramos nada 😢" |
| "Reintentar" | "Haz clic aquí para volver a intentarlo" |
| "MT", "Final", "67'" | "Medio tiempo en curso", "Partido finalizado" |
| "Mostrar marcador" | "¿Seguro que quieres ver el resultado?" |
| "Elegir ligas" | "¡Personaliza tu experiencia!" |

### Los 10 textos más vistos (ya en la app)

| Dónde | Texto |
|---|---|
| Día sin partidos | "Tus ligas no juegan este día." · botón "Ver próximos partidos" |
| Sin ligas elegidas | "Elige las ligas que sigues." · botón "Elegir ligas" |
| Error de red | "No se pudieron cargar los datos. Revisa tu conexión." · "Reintentar" |
| Liga que falla | "No se pudo cargar esta liga." |
| Próximos vacío | "No hay partidos de tus ligas en los próximos 7 días." |
| Antes del partido | "El partido no ha empezado." |
| Alineaciones pendientes | "Las alineaciones se publican más o menos una hora antes del partido." |
| Modo spoilers | "Sin spoilers" · "Mostrar marcador" |
| Ajustes | "Salen en este orden en Partidos, Próximos y Tablas." |
| Acerca de | "Palco no tiene anuncios, cuotas de apuestas, cuenta ni rastreo." |

## 5. Barrido

`sweep.py . --config replica/brand.json` → **limpio** (2026-11-23). También revisé a ojo el título de la pestaña, la cabecera, el favicon, el manifest y el ícono: no queda nada de "Cancha" fuera de `replica/` ni nada del original.
