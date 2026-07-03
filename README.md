# CrateForge

Editor visual para archivos de crate de **ExcellentCrates** (plugin de Minecraft/Paper). Corre 100% en el navegador — sin backend, sin subir tus YAML a ningún servidor.

## Qué hace

- **Importa/exporta YAML real** de ExcellentCrates preservando formato original: comentarios, orden de claves, estilo de comillas y indentación no cambian salvo en las líneas que edites en la UI (edición quirúrgica, no regeneración completa del archivo).
- **Editor de pesos y porcentajes**: cada reward muestra su `Weight` y el `%` real calculado (`peso / suma_total × 100`), con barra visual comparativa.
- **Panel de salud del pool**: detecta si el total actual coincide con tu objetivo, si hay residuos decimales que impiden cerrar en un número redondo, keys duplicadas, o pesos en 0/negativos — con sugerencias automáticas de rebalanceo.
- **Simulador de aperturas (Monte Carlo)**: tira N aperturas simuladas (1 a 100.000) y compara el % teórico vs. el % realmente obtenido, igual que pasaría en el servidor real.
- **Preview con formato Minecraft real**: nombres y lore se renderizan interpretando `&` legacy codes, hex (`&#RRGGBB`) y un subconjunto de MiniMessage (`<gradient>`, `<c:#hex>`, `<bold>`, etc.).

## Por qué no usa el "source" de ExcellentCrates

ExcellentCrates ([nulli0n/ExcellentCrates-spigot](https://github.com/nulli0n/ExcellentCrates-spigot)) es un plugin comercial de código cerrado — el repo de GitHub es solo la página de soporte/issues, no contiene el source real. Este editor no reimplementa el plugin ni su motor de apertura interno: es una herramienta independiente que **lee y escribe el mismo formato YAML** que el plugin consume, basada en documentación pública, ejemplos de configuración reales, y las reglas de pesos que son de dominio público (sistema de weighted random estándar).

## Correrlo localmente

```bash
npm install
npm run dev
```

## Build de producción

```bash
npm run build
npm run preview   # sirve el build en local para probarlo
```

## Deploy en GitHub Pages

Ya incluye un workflow (`.github/workflows/deploy.yml`) que:
1. Buildea la app en cada push a `main`.
2. Publica el resultado en GitHub Pages automáticamente.

Para activarlo:
1. Subí este repo a GitHub.
2. Andá a **Settings → Pages → Source** y elegí **GitHub Actions**.
3. Hacé push a `main`. El workflow calcula el `base path` solo, usando el nombre del repo.

## Deploy en otro lado (Vercel, Netlify, Railway)

Si lo servís desde la raíz de un dominio (no una subcarpeta como en GitHub Pages), no hace falta tocar nada: `vite build` con `VITE_BASE_PATH` sin definir usa `/` por defecto. Solo apuntá el build command a `npm run build` y el output a `dist/`.

## Estructura del proyecto

```
src/
  lib/
    crateFile.js    -> parser/serializador YAML quirurgico (preserva formato)
    weightMath.js   -> toda la matematica de pesos/%/residuos/simulacion
    mcText.js        -> parser de texto estilo Minecraft (& codes, MiniMessage)
  store/
    CrateStore.jsx  -> estado global de la app (contexto React)
  components/       -> UI
```

## Roadmap (no incluido en esta version)

- Editor visual de `Block` (holograma, particulas, posiciones).
- Editor de `Preview`/`Animation` con referencia a plantillas de TrMenu.
- Editor de `Milestones`.
- Conversores desde otros plugins de crates (CrazyCrates, etc.) - ver el prompt de conversion ya generado por separado.

## Licencia

Uso libre para tu propio servidor. ExcellentCrates es marca de sus autores; este proyecto no esta afiliado a nulli0n/NightExpress.
