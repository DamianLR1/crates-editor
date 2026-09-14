# Editor-ExcellentCrates

Editor visual para crates de **ExcellentCrates** (plugin de Minecraft/Paper), para las versiones **6.3.3** y **6.6.1**, con conversor de 6.3.3 a 6.6.1. Corre 100% en el navegador: sin backend y sin subir tus YAML a ningún servidor.

## Qué hace

- **Panel** con navegación lateral: Recompensas, Configuración, Simulador y Convertir. Con la carpeta del plugin abierta, la barra lateral lista todas las crates con su versión.
- **Recompensas**: tabla con búsqueda, filtro por rareza, orden por probabilidad y paginación. Cada reward se edita en el lugar: nombre, lore, comandos, rareza, preview (vanilla o custom), permisos y límites (`Win_Limit` en 6.3.3, `Limits` en 6.6.1).
- **Probabilidad real** de cada reward con el sorteo de dos niveles del plugin: primero la rareza por su Weight global, después el reward dentro de su rareza. Incluye un simulador Monte Carlo con el mismo sorteo.
- **Editor de previews** (`previews/*.yml`): a la izquierda se configura el menú (tamaño `generic_9xN`, título, slots y lore de las rewards, ítems fijos con material, nombre, lore, prioridad y acción) y a la derecha se ve cómo queda, con las rewards de la caja abierta paginadas y el tooltip ya procesado (`%reward_roll_chance%`, `%empty-if-above%`, `%nf_…%`). Con el pincel se asignan slots haciendo click en el menú.
- **Texturas y fuente de Minecraft en la vista previa**: cargando el `.jar` de tu cliente (`%APPDATA%\.minecraft\versions\<versión>\<versión>.jar`) y, si querés, resource packs `.zip`, el menú se dibuja con el inventario vanilla (`generic_54`), los ítems con su textura (bloques y modelos 3D proyectados como en el inventario, cabezas con su skin, brillo de encantamiento) y título y tooltips con la fuente del juego. Para versalitas, flechas y emojis se agrega la `unifont.zip` del juego (`.minecraft\assets\objects\…`). Los assets son de Mojang: se leen en tu navegador y quedan guardados en él (IndexedDB); no se suben ni se publican con el editor.
- **Resource pack del server**: agregando el `.zip` del pack (`.minecraft\resourcepacks\…`), los ítems con `custom_model_data` o `item_model` se ven con su modelo del pack (`range_dispatch` de `items/*.json`, modelos y texturas de cualquier namespace, como los de Nexo/MMOItems) y los glifos de su fuente aparecen en títulos y nombres. Las rewards `CUSTOM` (MMOItems, Nexo…) no traen el ítem en el YAML, así que siguen con un ícono genérico.
- **Texto como lo muestra nightcore**: `&` y `§` (incluido el hex de Bukkit `§x§R§R§G§G§B§B`), `#RRGGBB`, `&#RRGGBB`, `<#hex>`, gradientes, `<!i>` y los colores con nombre del esquema `custom` de `plugins/nightcore/color_schemes.yml` (por eso `&7` es `#A1A1A1`, no el gris vanilla). Como en nightcore, un color legacy no corta la negrita.
- **Configuración de la crate**: preview, animación, llaves y costos (`Key` + `Opening.Cost` en 6.3.3, `CostOptions` en 6.6.1), cooldown y límite de aperturas, comandos al abrir (`Post-Open`), bloque, holograma, efecto y metas.
- **Edición quirúrgica**: al exportar sólo cambian las líneas que editaste. El resto del archivo sale byte a byte igual, incluidas las líneas largas que SnakeYAML (el guardado del plugin) parte en varias.
- **Validación contra tu server**: con la carpeta `plugins/ExcellentCrates` abierta usa las rarezas reales de `config.yml` y avisa de llaves, previews, animaciones o templates que no existen, metas rotas, rewards que no entregan nada y costos inválidos.

## Conversor 6.3.3 → 6.6.1

| Qué | 6.3.3 | 6.6.1 |
|---|---|---|
| Ítems (ItemProvider, PreviewData, ItemsData, ItemData) | `Type` + `Tag` / `Handler` + `ItemId` | `Provider` + `Data` |
| Llaves | `Key.Required` + `Key.Ids` | `CostOptions` con entradas `key` |
| Costo en moneda | `Opening.Cost` | entradas `currency` dentro de cada opción |
| Cooldown de apertura | `Opening.Cooldown` | `OpeningCooldown` + `OpeningLimits` |
| Límites de premios | `Win_Limit.Player` / `Global` | `Limits` (un `Enabled`, modo `DAILY`/`CUSTOM`) |
| Placeholders | `Placeholder_Apply` en todos | sólo rewards ITEM; los comandos siempre usan PlaceholderAPI |
| Nuevo | — | `Block.Effect.Enabled`, `Post-Open.Commands` |

6.6.1 migra los archivos viejos solo al cargarlos, pero esa migración tiene tres bugs que el conversor evita:

- **Pierde el cooldown de apertura**: guarda `OpeningCooldown.Value: 0`.
- **Deja cajas abiertas de más**: crea opciones de costo con `Enabled` igual a `Key.Required` y separa la moneda de la llave, así que se puede abrir pagando sólo plata, o gratis. En 6.3.3 había que tener la llave **y** pagar, y así lo deja el conversor.
- **Saca el cooldown de medianoche**: `Win_Limit` con cooldown `-2` pasa a `DAILY` con valor 0, que en 6.6.1 significa "sin cooldown".

Todo lo que cambia de comportamiento aparece como aviso. Hay dos formas de usarlo:

- **Desde la web**, en la sección *Convertir a 6.6.1*: la crate abierta o la carpeta completa. En Chrome/Edge se guarda directo en una carpeta.
- **Por consola**:

  ```bash
  npm run convert -- "ruta/ExcellentCrates 6.3.3" "ruta/ExcellentCrates-6.6.1"
  ```

Copiá después `crates/` y `keys/` al server con el plugin apagado.

Formato verificado contra el source del fork 6.3.3 y el de 6.6.1 que usa el server (`Crate`, `AbstractReward`, `CommandReward`, `ItemReward`, `LimitValues`, `Cost`, `ItemHelper` y los adaptadores de ítems de nightcore).

## Correrlo localmente

```bash
npm install
npm run dev
```

## Check

```bash
npm run check                                              # fixtures internos
npm run check -- "ruta/ExcellentCrates 6.3.3/crates" ...    # además, crates reales
```

Verifica round-trip exacto, que editar un peso cambie una sola línea, el formato de rewards nuevos en cada versión, el conversor (estructura, idempotencia, que no queden claves viejas) y el cálculo de probabilidades.

## Deploy

GitHub Pages: el workflow `.github/workflows/deploy.yml` buildea y publica en cada push a `main` (Settings → Pages → Source: GitHub Actions). `dist/` no se commitea.

## Estructura

```
src/
  lib/
    crateFile.js          -> modelo de las dos versiones + edición quirúrgica del YAML
    convert661.js         -> conversor 6.3.3 -> 6.6.1
    previewMenu.js        -> menú de preview: lectura, slots, lore con placeholders
    mcAssets.js           -> texturas/modelos/fuente del .jar y resource packs (zip, IndexedDB, modelos 3D)
    crateFile.check.mjs   -> check (npm run check)
    weightMath.js         -> pesos, probabilidades, residuos, simulación
    serverContext.js      -> lectura de la carpeta del plugin + validaciones
    specializedConverter.js -> SpecializedCrates -> ExcellentCrates
    mcText.js             -> texto como nightcore (& / § / hex / tags, esquema de colores)
  store/CrateStore.jsx    -> estado global (el texto YAML es la fuente de verdad)
  components/             -> UI (fields.jsx: inputs y piezas compartidas)
scripts/convert.mjs       -> conversor por consola
```

## Licencia

Uso libre para tu propio servidor. ExcellentCrates es marca de sus autores; este proyecto no está afiliado a nulli0n/NightExpress.
