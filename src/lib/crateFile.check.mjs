// Check de crateFile + convert661 + weightMath. Correr con `npm run check`, o
// `npm run check -- <carpeta crates> [<otra carpeta crates>...]` para probar crates reales.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadCrateFile, editCrateText, checkRoundTripFidelity, parseYaml, itemNode, V633, V661,
  setRewardWeight, setRewardField, setField, setNode, deleteField, addReward, deleteReward, addMilestone,
} from './crateFile.js';
import { convertCrate, convertKey } from './convert661.js';
import { computePercentages } from './weightMath.js';

// Líneas de `b` que no están en la misma posición en `a`
const changedLines = (a, b) => b.split('\n').filter((line, i) => line !== a.split('\n')[i]);
const js = (text) => parseYaml(text).toJS();

// ---------- 6.3.3: edición quirúrgica ----------

// Estilo SnakeYAML: el plugin parte las líneas largas (Name de "a").
const SRC = `Name: Test
Rewards:
  List:
    a:
      Type: COMMAND
      Weight: 10.0
      Rarity: common
      Name: '&euno dos tres cuatro cinco seis siete ocho nueve diez once doce trece
        catorce'
      Commands:
      - say a
    b:
      Type: COMMAND
      Weight: 30.0
      Rarity: rare
      Name: b
      Commands: []
_dataver: 600
`;

assert.ok(checkRoundTripFidelity(SRC), 'sin editar debe salir idéntico');

// Editar un peso toca una sola línea y conserva el ".0" y la línea partida
let out = editCrateText(SRC, (d) => setRewardWeight(d, 'b', 20));
assert.deepEqual(changedLines(SRC, out), ['      Weight: 20.0']);

// YAML 1.1: "yes" tiene que ir entre comillas o SnakeYAML lo lee como boolean
out = editCrateText(SRC, (d) => setRewardField(d, 'b', 'Name', 'yes'));
assert.deepEqual(changedLines(SRC, out), ["      Name: 'yes'"]);

// Reward nuevo: formato del plugin, el resto intacto
out = editCrateText(SRC, (d) => addReward(d, 'c', { name: '&aC', commands: ['say c'] }, V633));
assert.ok(out.startsWith(SRC.slice(0, SRC.indexOf('_dataver'))), 'lo anterior al reward nuevo no cambia');
assert.ok(out.endsWith('_dataver: 600\n'));
assert.match(out, /\n {4}c:\n {6}Type: COMMAND\n {6}PreviewData:\n {8}Type: VANILLA\n/);
assert.match(out, /\n {6}Weight: 10\.0\n/);
assert.match(out, /\n {10}CooldownStep: 1\n/);
assert.match(out, /\n {6}Ignored_For_Permissions: \[\]\n/);
assert.match(out, /\n {6}Name: '&aC'\n {6}Description: \[\]\n {6}Commands:\n {6}- say c\n/);
assert.ok(!out.includes('{ '), 'nada en estilo flow');

// Borrar
out = editCrateText(SRC, (d) => deleteReward(d, 'a'));
assert.ok(!out.includes('    a:') && out.includes('    b:\n      Type: COMMAND\n      Weight: 30.0'));

// Metas: keys '0', '1'... como las escribe el plugin
out = editCrateText(SRC, (d) => addMilestone(d, 'b', 10));
assert.match(out, /Milestones:\n {2}List:\n {4}'0':\n {6}Reward_Id: b\n {6}Openings: 10\n/);

// Paths que no existían se crean como secciones normales (no !!omap) y se borran limpios
out = editCrateText(SRC, (d) => setField(d, ['Opening', 'Cost', 'vault'], 100));
assert.ok(out.endsWith('_dataver: 600\nOpening:\n  Cost:\n    vault: 100\n'), out);
assert.equal(editCrateText(out, (d) => deleteField(d, ['Opening', 'Cost', 'vault'])), `${SRC}Opening: {}\n`);

// ---------- 6.6.1: edición con las claves nuevas ----------

const SRC661 = `Name: T
OpeningCooldown:
  Enabled: false
  Value: 0
_dataver: 600
Post-Open:
  Commands: []
Rewards:
  List:
    a:
      Type: COMMAND
      PreviewData:
        Provider: vanilla
        Data:
          Value: '{count:1,id:"minecraft:gold_nugget"}'
          DataVersion: 4671
      Weight: 10.0
      Rarity: common
      Broadcast: false
      Limits:
        Enabled: false
        CooldownType: DAILY
        GlobalAmount: -1
        PlayerAmount: -1
        GlobalCooldown: 0
        PlayerCooldown: 0
      Name: a
      Commands:
      - say a
CostOptions:
  k:
    Enabled: true
    Name: K
    Entries:
      '0':
        Type: key
        Key: llave
        Amount: 1
`;

const m661 = loadCrateFile(SRC661).model;
assert.equal(m661.format, V661);
assert.equal(loadCrateFile(SRC).model.format, V633);
assert.deepEqual(m661.keyIds, ['llave']);
assert.deepEqual(m661.rewards[0].previewData, { type: 'VANILLA', tagValue: '{count:1,id:"minecraft:gold_nugget"}', tagDataVersion: 4671 });
assert.ok(checkRoundTripFidelity(SRC661));
out = editCrateText(SRC661, (d) => setRewardField(d, 'a', ['Limits', 'Enabled'], true));
assert.deepEqual(changedLines(SRC661, out), ['        Enabled: true']);
out = editCrateText(SRC661, (d) => addReward(d, 'b', { name: 'b', commands: ['say b'] }, V661));
const newReward = out.slice(out.indexOf('    b:'), out.indexOf('CostOptions'));
assert.match(newReward, /^ {4}b:\n {6}Type: COMMAND\n {6}PreviewData:\n {8}Provider: vanilla\n {8}Data:\n/);
assert.match(newReward, /\n {6}Limits:\n {8}Enabled: false\n {8}CooldownType: DAILY\n/);
assert.ok(!/Win_Limit|Placeholder_Apply/.test(newReward));
out = editCrateText(SRC661, (d) => setNode(d, ['Rewards', 'List', 'a', 'PreviewData'], itemNode(V661, { type: 'CUSTOM', handler: 'MMOItems', itemId: 'SWORD:X' })));
assert.match(out, /PreviewData:\n {8}Provider: mmoitems\n {8}Data:\n {10}ID: SWORD:X\n {10}Amount: 1\n/);

// ---------- Convertidor 6.3.3 -> 6.6.1 ----------

const LEGACY = `Name: Test
ItemProvider:
  Type: VANILLA
  Tag:
    Value: '{count:1,id:"minecraft:chest"}'
    DataVersion: 4189
Opening:
  Cooldown: 30
  Cost:
    vault: 500.0
Key:
  Required: true
  Ids:
  - Llave
Block:
  Effect:
    Model: vortex
    Particle:
      Name: ASH
_dataver: 600
Rewards:
  List:
    a:
      Type: COMMAND
      PreviewData:
        Type: CUSTOM
        Handler: MMOItems
        ItemId: SWORD:X
        Amount: 0
      Weight: 10.0
      Rarity: common
      Placeholder_Apply: true
      Win_Limit:
        Player:
          Enabled: true
          Amount: 1
          Cooldown: -2
          CooldownStep: 1
        Global:
          Enabled: false
          Amount: 5
          Cooldown: 0
          CooldownStep: 1
      Name: a
      Commands:
      - say a
    b:
      Type: ITEM
      Weight: 5.0
      Rarity: common
      ItemsData:
        '0':
          Type: VANILLA
          Tag:
            Value: '{count:2,id:"minecraft:diamond"}'
            DataVersion: 4189
      PreviewData:
        Tag:
          Value: '{}'
          DataVersion: -1
`;

const converted = convertCrate(LEGACY);
const c = js(converted.text);
assert.deepEqual(Object.keys(c), ['Name', 'ItemProvider', 'OpeningCooldown', 'OpeningLimits', 'Block', '_dataver', 'Post-Open', 'Rewards', 'CostOptions']);
assert.deepEqual(c.ItemProvider, { Provider: 'vanilla', Data: { Value: '{count:1,id:"minecraft:chest"}', DataVersion: 4189 } });
assert.deepEqual(c.OpeningCooldown, { Enabled: true, Value: 30 }, 'el cooldown se conserva (6.6.1 lo perdía)');
assert.deepEqual(c.OpeningLimits, { Amount: 1 });
assert.deepEqual(c.Block.Effect, { Enabled: true, Model: 'vortex', Particle: { Name: 'ASH' } });
assert.deepEqual(c['Post-Open'], { Commands: [] });
// llave Y moneda en la misma opción, como en 6.3.3; sin opción de sólo-moneda
assert.deepEqual(Object.keys(c.CostOptions), ['key_llave']);
assert.deepEqual(c.CostOptions.key_llave.Entries, {
  0: { Type: 'key', Key: 'llave', Amount: 1 },
  1: { Type: 'currency', Currency: 'vault', Amount: 500 },
});
assert.equal(c.CostOptions.key_llave.Enabled, true);
assert.match(converted.text, /\n {8}Amount: 500\.0\n/, 'la moneda queda como double');
assert.ok(!/&a\d|\*a\d/.test(converted.text), 'sin anchors/aliases');

const a = c.Rewards.List.a;
assert.deepEqual(Object.keys(a), ['Type', 'PreviewData', 'Weight', 'Rarity', 'Limits', 'Name', 'Commands']);
assert.deepEqual(a.PreviewData, { Provider: 'mmoitems', Data: { ID: 'SWORD:X', Amount: 1 } });
assert.deepEqual(a.Limits, { Enabled: true, CooldownType: 'DAILY', GlobalAmount: -1, PlayerAmount: 1, GlobalCooldown: 0, PlayerCooldown: 1 });
const b = c.Rewards.List.b;
assert.equal(b.PreviewData, undefined, 'preview vacío: 6.6.1 usa su placeholder');
assert.deepEqual(b.ItemsData['0'], { Provider: 'vanilla', Data: { Value: '{count:2,id:"minecraft:diamond"}', DataVersion: 4189 } });
assert.equal(b.Placeholder_Apply, false);
assert.deepEqual(b.Limits, { Enabled: false, CooldownType: 'DAILY', GlobalAmount: -1, PlayerAmount: -1, GlobalCooldown: 0, PlayerCooldown: 0 });
assert.ok(converted.warnings.some((w) => w.includes('Placeholder_Apply')));
assert.equal(convertCrate(converted.text).text, converted.text, 'la conversión es idempotente');
assert.equal(loadCrateFile(converted.text).model.format, V661);

// Key.Required false + moneda: la llave queda deshabilitada y la moneda sola habilitada
const free = js(convertCrate('Key:\n  Required: false\n  Ids:\n  - x\nOpening:\n  Cooldown: 0\n  Cost:\n    vault: 10.0\n').text);
assert.equal(free.CostOptions.key_x.Enabled, false);
assert.deepEqual(free.CostOptions.eco_vault.Entries, { 0: { Type: 'currency', Currency: 'vault', Amount: 10 } });
assert.equal(free.CostOptions.eco_vault.Enabled, true);

// CostOptions sin entradas (restos de una corrida de 6.6.1) se descartan
const leftover = convertCrate('Key:\n  Required: true\n  Ids:\n  - x\nCostOptions:\n  old:\n    Enabled: true\n    Name: Old\n');
assert.deepEqual(Object.keys(js(leftover.text).CostOptions), ['key_x']);
assert.ok(leftover.warnings.some((w) => w.includes('sin entradas')));

// Llaves
const key = convertKey("Name: K\nVirtual: true\nItemData:\n  Type: VANILLA\n  Tag:\n    Value: '{count:1,id:\"minecraft:tripwire_hook\"}'\n    DataVersion: 4189\nItemStackable: false\n");
assert.equal(key.text, "Name: K\nVirtual: true\nItemData:\n  Provider: vanilla\n  Data:\n    Value: '{count:1,id:\"minecraft:tripwire_hook\"}'\n    DataVersion: 4189\nItemStackable: false\n");

// ---------- Sorteo de dos niveles ----------

const pct = (rewards, w) => computePercentages(rewards, w).map((r) => Math.round(r.percent * 100) / 100);
const pool = [{ key: 'a', weight: 10, rarity: 'common' }, { key: 'b', weight: 30, rarity: 'rare' }];
assert.deepEqual(pct(pool, { common: 70, rare: 30 }), [70, 30]);
// rareza inexistente -> la más común (no peso 1)
assert.deepEqual(pct([pool[0], { ...pool[1], rarity: 'uncommon' }], { common: 70, rare: 30 }), [25, 75]);
// peso 0 no se sortea
assert.deepEqual(pct([{ ...pool[0], weight: 0 }, pool[1]], { common: 70, rare: 30 }), [0, 100]);

// ---------- Crates reales (opcional) ----------

const LEGACY_KEYS = /^(Key|Opening):|^\s+(Win_Limit|Tag|Handler|ItemId):|^\s+Type: (VANILLA|CUSTOM)\s*$/m;
const sortedKeys = (_, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y))) : v);
const canon = (text) => JSON.stringify(js(text), sortedKeys);

for (const dir of process.argv.slice(2)) {
  for (const f of readdirSync(dir).filter((name) => /\.ya?ml$/i.test(name))) {
    const text = readFileSync(join(dir, f), 'utf8');
    const { model } = loadCrateFile(text);
    assert.ok(checkRoundTripFidelity(text), `${f}: round-trip`);
    const first = model.rewards[0];
    if (first) {
      const edited = editCrateText(text, (d) => setRewardWeight(d, first.key, first.weight + 1));
      assert.equal(changedLines(text, edited).length, 1, `${f}: editar un peso cambió más de una línea`);
    }
    const conv = convertCrate(text);
    assert.ok(!LEGACY_KEYS.test(conv.text), `${f}: quedaron claves de 6.3.3`);
    assert.equal(loadCrateFile(conv.text).model.format, V661, `${f}: no quedó en 6.6.1`);
    assert.equal(convertCrate(conv.text).text, conv.text, `${f}: la conversión no es idempotente`);
    if (model.format === V661) assert.equal(canon(conv.text), canon(text), `${f}: convertir un 6.6.1 cambió valores`);
    console.log(`ok ${f} (${model.format}${conv.warnings.length ? `, ${conv.warnings.length} aviso(s) al convertir` : ''})`);
  }
}
console.log('check ok');
