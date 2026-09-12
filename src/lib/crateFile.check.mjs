// Check de crateFile + weightMath. Correr con `npm run check`, o
// `npm run check -- <ruta>/plugins/ExcellentCrates/crates` para probar crates reales.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadCrateFile, editCrateText, checkRoundTripFidelity,
  setRewardWeight, setRewardField, setField, deleteField, addReward, deleteReward, addMilestone,
} from './crateFile.js';
import { computePercentages } from './weightMath.js';

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

// Líneas de `b` que no están en la misma posición en `a`
const changedLines = (a, b) => b.split('\n').filter((line, i) => line !== a.split('\n')[i]);

assert.ok(checkRoundTripFidelity(SRC), 'sin editar debe salir idéntico');

// Editar un peso toca una sola línea y conserva el ".0" y la línea partida
let out = editCrateText(SRC, (d) => setRewardWeight(d, 'b', 20));
assert.deepEqual(changedLines(SRC, out), ['      Weight: 20.0']);

// YAML 1.1: "yes" tiene que ir entre comillas o SnakeYAML lo lee como boolean
out = editCrateText(SRC, (d) => setRewardField(d, 'b', 'Name', 'yes'));
assert.deepEqual(changedLines(SRC, out), ["      Name: 'yes'"]);

// Reward nuevo: formato del plugin, el resto intacto
out = editCrateText(SRC, (d) => addReward(d, 'c', { name: '&aC', commands: ['say c'] }));
assert.ok(out.startsWith(SRC.slice(0, SRC.indexOf('_dataver'))), 'lo anterior al reward nuevo no cambia');
assert.ok(out.endsWith('_dataver: 600\n'));
assert.match(out, /\n {4}c:\n {6}Type: COMMAND\n {6}PreviewData:\n/);
assert.match(out, /\n {6}Weight: 10\.0\n/);
assert.match(out, /\n {10}CooldownStep: 1\n/);
assert.match(out, /\n {6}Ignored_For_Permissions: \[\]\n/);
assert.match(out, /\n {6}Name: '&aC'\n {6}Description: \[\]\n {6}Commands:\n {6}- say c\n/);
assert.ok(!out.includes('{ '), 'nada en estilo flow');
assert.equal(loadCrateFile(out).model.rewards[2].winLimit.player.cooldownStep, 1);

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

// Sorteo de dos niveles
const pct = (rewards, w) => computePercentages(rewards, w).map((r) => Math.round(r.percent * 100) / 100);
const rewards = [{ key: 'a', weight: 10, rarity: 'common' }, { key: 'b', weight: 30, rarity: 'rare' }];
assert.deepEqual(pct(rewards, { common: 70, rare: 30 }), [70, 30]);
// rareza inexistente -> la más común (no peso 1)
assert.deepEqual(pct([rewards[0], { ...rewards[1], rarity: 'uncommon' }], { common: 70, rare: 30 }), [25, 75]);
// peso 0 no se sortea
assert.deepEqual(pct([{ ...rewards[0], weight: 0 }, rewards[1]], { common: 70, rare: 30 }), [0, 100]);

// Crates reales (opcional): round-trip exacto y un peso = una línea
const dir = process.argv[2];
if (dir) {
  for (const f of readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f))) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert.ok(checkRoundTripFidelity(text), `${f}: round-trip`);
    const first = loadCrateFile(text).model.rewards[0];
    if (first) {
      const edited = editCrateText(text, (d) => setRewardWeight(d, first.key, first.weight + 1));
      assert.equal(changedLines(text, edited).length, 1, `${f}: editar un peso cambió más de una línea`);
    }
    console.log(`ok ${f}`);
  }
}
console.log('check ok');
