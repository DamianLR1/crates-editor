# CrateForge

Editor visual para archivos de crate de **ExcellentCrates** (plugin de Minecraft/Paper). Corre 100% en el navegador — sin backend, sin subir tus YAML a ningún servidor.

## Qué hace

- **Edición quirúrgica del YAML**: al exportar, solo cambian las líneas de lo que editaste. El resto del archivo sale byte a byte igual, incluidas las líneas largas que SnakeYAML (el guardado del plugin) parte en varias.
- **Abrir la carpeta del plugin** (`plugins/ExcellentCrates`): lista todas las crates, carga las rarezas reales de `config.yml` y avisa de referencias rotas (llaves que no existen en `keys/`, previews, animaciones, templates de holograma, metas que apuntan a rewards inexistentes).
- **% real de cada reward** con el sorteo de dos niveles del plugin (rareza por su Weight global, después reward dentro de su rareza).
- **Panel de salud del pool**: total vs objetivo, residuos decimales, pesos en 0, keys duplicadas, rarezas inexistentes, rewards que no entregan nada.
- **Simulador de aperturas (Monte Carlo)** con el mismo sorteo.
- **Editor completo de rewards**: nombre, lore, comandos, rareza, broadcast, PlaceholderAPI, PreviewData (vanilla/custom), permisos, Win_Limit (con CooldownStep). Rewards tipo ITEM muestran sus ítems (el NBT se sigue editando in-game).
- **Editor de la crate**: llaves, preview, animación, cooldown, costo de apertura (`Opening.Cost`), permiso, bloque/holograma/efecto de partículas y metas (`Milestones.List`).
- **Preview con formato Minecraft**: `&` codes, hex (`&#RRGGBB`) y un subconjunto de MiniMessage.

## Formato

Verificado contra el source del fork **6.3.3** que corre el server (`Crate.java`, `AbstractReward.java`, `CommandReward.java`, `ItemReward.java`, `LimitValues.java`, `RewardFactory.java`). Detalles que respeta:

- Rewards nuevos con el mismo orden de claves y valores por defecto que el plugin (`Weight: 10.0`, `Win_Limit` con `CooldownStep`, PreviewData de command_block).
- IDs de reward, llaves, preview, animación y template en minúsculas (el plugin los pasa a minúsculas).
- Una rareza que no existe en `config.yml` cae a la más común (la de mayor Weight); peso 0 no se sortea.
- Con PreviewData `CUSTOM`, un reward COMMAND usa el nombre/lore del ítem y el plugin borra `Name`/`Description` al guardar.
- Se lee y escribe como YAML 1.1 (igual que SnakeYAML).

Los archivos con claves de versiones más nuevas del plugin (`ItemProvider.Provider/Data`, `Limits`, `CostOptions`) se conservan tal cual, pero el fork 6.3.3 las ignora.

## Correrlo localmente

```bash
npm install
npm run dev
```

## Check

```bash
npm run check                                            # fixture interno
npm run check -- ruta/a/plugins/ExcellentCrates/crates   # además, todas tus crates reales
```

Verifica round-trip exacto, que editar un peso cambie una sola línea, el formato de rewards nuevos y el cálculo de %.

## Build de producción

```bash
npm run build
npm run preview   # sirve el build en local para probarlo
```

## Deploy

- **Firebase Hosting** (`firebase.json` sirve `dist/`): `npm run build` y `firebase deploy`.
- **GitHub Pages**: el workflow `.github/workflows/deploy.yml` buildea y publica en cada push a `main` (Settings → Pages → Source: GitHub Actions).

## Estructura del proyecto

```
src/
  lib/
    crateFile.js         -> modelo + edición quirúrgica del YAML
    crateFile.check.mjs  -> check (npm run check)
    weightMath.js        -> pesos, %, residuos, simulación
    serverContext.js     -> lectura de la carpeta del plugin + validaciones
    specializedConverter.js -> SpecializedCrates -> ExcellentCrates
    mcText.js            -> texto estilo Minecraft (& codes, MiniMessage)
  store/
    CrateStore.jsx       -> estado global (el texto YAML es la fuente de verdad)
  components/            -> UI (fields.jsx: inputs compartidos)
```

## Pendiente

- Editar el NBT de ItemsData / ItemProvider (hoy se conserva tal cual; se edita in-game).
- Editar llaves (`keys/*.yml`) y guardar varias crates de una vez (hoy se exporta la crate abierta).

## Licencia

Uso libre para tu propio servidor. ExcellentCrates es marca de sus autores; este proyecto no esta afiliado a nulli0n/NightExpress.
