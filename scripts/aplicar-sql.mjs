#!/usr/bin/env node
/**
 * Aplica un archivo .sql contra la base de `DATABASE_URL`.
 * =============================================================================
 *
 * Existe porque el MCP `postgres` del entorno de n8n es de SOLO LECTURA y no
 * puede aplicar DDL ni seeds, y porque `sql\aplicar-sql.js` del perfil del
 * equipo no está en disco en todas las máquinas.
 *
 * Manda el archivo ENTERO en una sola consulta, sin trocearlo por `;`. Es
 * importante: estos scripts llevan bloques `do $$ ... $$` con puntos y comas
 * dentro, y cualquier troceo ingenuo los parte por la mitad. El protocolo
 * simple de Postgres acepta varias sentencias de una vez y las ejecuta en una
 * transacción implícita.
 *
 * USO
 *   node scripts/aplicar-sql.mjs db/seed-empresa.sql
 *   node scripts/aplicar-sql.mjs db/seed-empresa.sql --set clave=valor
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const RAIZ = path.resolve(import.meta.dirname, "..");

function salir(mensaje) {
  console.error(`\n  ✗ ${mensaje}\n`);
  process.exit(1);
}

const archivo = process.argv[2];
if (!archivo) salir("Falta el archivo. Uso: node scripts/aplicar-sql.mjs <archivo.sql>");

const ruta = path.resolve(RAIZ, archivo);
if (!fs.existsSync(ruta)) salir(`No existe ${ruta}`);

// --set clave=valor  ->  set_config('clave', 'valor', false) antes del script,
// para pasar contraseñas sin escribirlas en el .sql.
const ajustes = [];
for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === "--set" && process.argv[i + 1]) {
    const [clave, ...resto] = process.argv[i + 1].split("=");
    ajustes.push([clave, resto.join("=")]);
    i++;
  }
}

const envPath = path.join(RAIZ, ".env.local");
if (!fs.existsSync(envPath)) salir("No encuentro .env.local");
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Za-z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    })
);
if (!env.DATABASE_URL) salir("Falta DATABASE_URL en .env.local");

const sql = fs.readFileSync(ruta, "utf8");

const cliente = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
  // Los seeds con bucles tardan más que una consulta normal.
  statement_timeout: 300000,
});

// `raise notice` del script sale por aquí: sin esto, los bloques de
// comprobación no cuentan nada.
cliente.on("notice", (n) => console.log(`  ${n.message}`));

const inicio = Date.now();
try {
  await cliente.connect();
  for (const [clave, valor] of ajustes) {
    await cliente.query("select set_config($1, $2, false)", [clave, valor]);
  }
  await cliente.query(sql);
  console.log(`\n  ✓ ${path.basename(ruta)} aplicado en ${Date.now() - inicio} ms\n`);
} catch (e) {
  // Postgres dice la posición del carácter; traducirla a línea ahorra buscar.
  let ubicacion = "";
  if (e.position) {
    const hasta = sql.slice(0, Number(e.position));
    const linea = hasta.split("\n").length;
    ubicacion = `\n    en la línea ${linea}: ${sql.split("\n")[linea - 1]?.trim() ?? ""}`;
  }
  salir(`${e.message}${e.detail ? `\n    ${e.detail}` : ""}${e.hint ? `\n    Pista: ${e.hint}` : ""}${ubicacion}`);
} finally {
  await cliente.end().catch(() => {});
}
