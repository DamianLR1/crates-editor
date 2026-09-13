// Convierte una carpeta plugins/ExcellentCrates 6.3.3 al formato 6.6.1.
// Uso: npm run convert -- <carpeta 6.3.3> <carpeta de salida>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { convertCrate, convertKey } from '../src/lib/convert661.js';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('Uso: npm run convert -- <carpeta 6.3.3> <carpeta de salida>');
  process.exit(1);
}
if (resolve(src) === resolve(out)) {
  console.error('La salida tiene que ser otra carpeta: no se pisan los originales.');
  process.exit(1);
}

let converted = 0;
let failed = 0;
for (const [dir, convert] of [['crates', convertCrate], ['keys', convertKey]]) {
  let files;
  try {
    files = readdirSync(join(src, dir)).filter((f) => /\.ya?ml$/i.test(f));
  } catch {
    console.warn(`(no hay ${dir}/ en ${src})`);
    continue;
  }
  mkdirSync(join(out, dir), { recursive: true });
  for (const file of files) {
    try {
      const { text, warnings } = convert(readFileSync(join(src, dir, file), 'utf8'));
      writeFileSync(join(out, dir, file), text);
      converted++;
      console.log(`ok  ${dir}/${file}`);
      for (const w of warnings) console.log(`    ! ${w}`);
    } catch (e) {
      failed++;
      console.log(`ERR ${dir}/${file}: ${e.message}`);
    }
  }
}
console.log(`\n${converted} archivo(s) convertidos en ${out}${failed ? `, ${failed} con error` : ''}.`);
process.exit(failed ? 1 : 0);
