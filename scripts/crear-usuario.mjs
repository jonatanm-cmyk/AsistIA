#!/usr/bin/env node
/**
 * Da de alta un usuario del backoffice.
 * =============================================================================
 *
 * POR QUÉ HACE FALTA UN SCRIPT
 *
 * Un usuario de AsistIA son DOS cosas en dos sitios distintos:
 *
 *   1. Una cuenta en Supabase Auth  -> quién puede autenticarse
 *   2. Una fila en `asistia.usuarios` -> qué rol tiene y de qué empresa es
 *
 * Sin la (2), alguien puede iniciar sesión en Supabase y aun así no entrar: el
 * backoffice lo trata como si no existiera. Es deliberado, y es lo que impide
 * que cualquiera con una cuenta de Auth se asome al panel.
 *
 * Este script enlaza las dos, y evita el paso que más se falla: copiar el UUID
 * a mano. Busca la cuenta por correo y saca el id él solo.
 *
 * USO
 *   node scripts/crear-usuario.mjs --email tu@correo.com --rol INTERSIM --nombre "Tu Nombre"
 *   node scripts/crear-usuario.mjs --email admin@empresa.com --rol ADMIN_EMPRESA --empresa demo-educonecta
 *
 * Si la cuenta de Auth no existe todavía:
 *   · Con SUPABASE_SECRET_KEY en .env.local -> el script la crea (pide --password).
 *   · Sin ella -> te dice exactamente qué hacer en el panel y para aquí.
 *
 * La contraseña también se puede pasar por entorno, para que no quede en el
 * historial del terminal:
 *   $env:ASISTIA_NUEVO_PASSWORD="..." ; node scripts/crear-usuario.mjs --email ...
 */

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

// ---------------------------------------------------------------------------
// Entorno
// ---------------------------------------------------------------------------
const RAIZ = path.resolve(import.meta.dirname, "..");

function leerEnv() {
  const archivo = path.join(RAIZ, ".env.local");
  if (!fs.existsSync(archivo)) {
    salir("No encuentro .env.local. Cópialo de .env.example y rellénalo.");
  }
  const env = {};
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function leerArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const clave = argv[i].slice(2);
    const siguiente = argv[i + 1];
    if (siguiente && !siguiente.startsWith("--")) {
      args[clave] = siguiente;
      i++;
    } else {
      args[clave] = true;
    }
  }
  return args;
}

function salir(mensaje) {
  console.error(`\n  ✗ ${mensaje}\n`);
  process.exit(1);
}

const args = leerArgs();

if (args.help || !args.email) {
  console.log(`
  Alta de usuario del backoffice de AsistIA

    --email    <correo>        obligatorio
    --rol      INTERSIM | ADMIN_EMPRESA   (por defecto: INTERSIM)
    --empresa  <client_key>    obligatorio si el rol es ADMIN_EMPRESA
    --nombre   "Nombre"        opcional
    --password <contraseña>    solo si hay que crear la cuenta de Auth
                               (o la variable ASISTIA_NUEVO_PASSWORD)
    --generar-password         genera una fuerte y la muestra una vez

  Ejemplos:
    node scripts/crear-usuario.mjs --email rodrigo.f@intersim.io --rol INTERSIM --nombre "Rodrigo"
    node scripts/crear-usuario.mjs --email camilo.v@intersim.io --rol ADMIN_EMPRESA \\
                                   --empresa educonecta --nombre "Camilo V." --generar-password
`);
  process.exit(args.email ? 0 : 1);
}

const email = String(args.email).trim().toLowerCase();
const rol = String(args.rol ?? "INTERSIM").toUpperCase();
const nombre = args.nombre ? String(args.nombre) : null;
const clientKey = args.empresa ? String(args.empresa) : null;

/**
 * Contraseña: la eliges tú, o la genera el script con --generar-password.
 *
 * La generada usa `randomBytes`, no `Math.random()`, que es predecible y no
 * sirve para nada que proteja una cuenta. Se imprime una sola vez y no se
 * guarda en ningún sitio: quien la reciba debería cambiarla al entrar.
 */
let password = args.password ? String(args.password) : process.env.ASISTIA_NUEVO_PASSWORD;
let passwordGenerada = false;
if (!password && args["generar-password"]) {
  const { randomBytes } = await import("node:crypto");
  const alfabeto = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  password = Array.from(randomBytes(20))
    .map((b) => alfabeto[b % alfabeto.length])
    .join("");
  passwordGenerada = true;
}

if (!["INTERSIM", "ADMIN_EMPRESA"].includes(rol)) {
  salir(`Rol no válido: "${rol}". Solo INTERSIM o ADMIN_EMPRESA.`);
}
// Lo impone un CHECK del esquema; comprobarlo aquí da un mensaje que se entiende
// en vez de un error de constraint.
if (rol === "ADMIN_EMPRESA" && !clientKey) {
  salir("Un ADMIN_EMPRESA tiene que pertenecer a una empresa: añade --empresa <client_key>.");
}
if (rol === "INTERSIM" && clientKey) {
  salir("Un usuario INTERSIM no pertenece a ninguna empresa: quita --empresa.");
}

// ---------------------------------------------------------------------------
// Manos a la obra
// ---------------------------------------------------------------------------
const env = leerEnv();
if (!env.DATABASE_URL) salir("Falta DATABASE_URL en .env.local.");

const cliente = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await cliente.connect();
} catch (e) {
  salir(
    `No se pudo conectar a la base: ${e.message}\n` +
      `    Comprueba DATABASE_URL, o abre /api/health para un diagnóstico.`
  );
}

try {
  // --- 1. La empresa, si toca ---------------------------------------------
  let empresaId = null;
  if (clientKey) {
    const r = await cliente.query(
      "select id, nombre from asistia.empresas where client_key = $1",
      [clientKey]
    );
    if (r.rowCount === 0) {
      const todas = await cliente.query(
        "select client_key from asistia.empresas order by creada_en"
      );
      salir(
        `No existe la empresa "${clientKey}".\n` +
          `    Empresas dadas de alta: ${
            todas.rowCount ? todas.rows.map((x) => x.client_key).join(", ") : "ninguna todavía"
          }`
      );
    }
    empresaId = r.rows[0].id;
    console.log(`  · Empresa: ${r.rows[0].nombre}`);

    // El índice `usuarios_un_admin_por_empresa_uidx` solo deja uno. Avisar antes
    // es más útil que dejar que reviente el INSERT.
    const yaHay = await cliente.query(
      "select email from asistia.usuarios where empresa_id = $1 and rol = 'ADMIN_EMPRESA'",
      [empresaId]
    );
    if (yaHay.rowCount > 0 && yaHay.rows[0].email !== email) {
      salir(
        `Esa empresa ya tiene administrador: ${yaHay.rows[0].email}\n` +
          `    El esquema solo permite uno por empresa.`
      );
    }
  }

  // --- 2. La cuenta de Supabase Auth --------------------------------------
  let authUserId = null;
  const existente = await cliente.query("select id from auth.users where email = $1", [email]);

  if (existente.rowCount > 0) {
    authUserId = existente.rows[0].id;
    console.log(`  · Cuenta de Auth encontrada: ${authUserId}`);
  } else {
    const claveSecreta = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

    if (!claveSecreta || claveSecreta.startsWith("<<<")) {
      console.error(`
  ✗ No existe la cuenta de Auth de ${email}, y no hay clave secreta para crearla.

    Tienes dos caminos:

    A) Crearla a mano (no hace falta ninguna clave)
       1. Panel de Supabase -> Authentication -> Users -> Add user
       2. Correo: ${email}
          Contraseña: la que quieras
          ✔ MARCA "Auto Confirm User"   <- sin esto no podrás entrar
       3. Vuelve a ejecutar este mismo comando. El script encontrará la cuenta
          y creará la fila que falta.

    B) Dejar que el script la cree
       1. Panel -> Project Settings -> API Keys -> Secret keys -> Reveal
       2. Pégala en .env.local como SUPABASE_SECRET_KEY=sb_secret_...
       3. Repite el comando añadiendo --password "tu-contraseña"
`);
      process.exit(1);
    }

    if (!password) {
      salir(
        "Hay clave secreta, así que puedo crear la cuenta, pero falta la contraseña.\n" +
          '    Elige una:  --password "..."   (o la variable ASISTIA_NUEVO_PASSWORD)\n' +
          "    O que la genere el script:  --generar-password"
      );
    }
    if (String(password).length < 8) {
      salir("La contraseña necesita al menos 8 caracteres (lo exige Supabase).");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, claveSecreta, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // email_confirm: true -> queda confirmada al vuelo. Sin esto Supabase
    // manda un correo de verificación y el login falla hasta que se abra.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
    });

    if (error || !data?.user) {
      salir(`Supabase rechazó la creación: ${error?.message ?? "error desconocido"}`);
    }
    authUserId = data.user.id;
    console.log(`  · Cuenta de Auth creada: ${authUserId}`);
  }

  // --- 3. La fila de asistia.usuarios -------------------------------------
  // Idempotente: repetir el comando corrige el rol o la empresa en vez de
  // chocar contra el índice único de auth_user_id.
  const r = await cliente.query(
    `insert into asistia.usuarios (auth_user_id, empresa_id, email, nombre, rol, estado)
     values ($1, $2, $3, $4, $5, 'ACTIVO')
     on conflict (auth_user_id) do update
        set empresa_id = excluded.empresa_id,
            email      = excluded.email,
            nombre     = coalesce(excluded.nombre, asistia.usuarios.nombre),
            rol        = excluded.rol,
            estado     = 'ACTIVO'
     returning id, (xmax = 0) as creado`,
    [authUserId, empresaId, email, nombre, rol]
  );

  const { id, creado } = r.rows[0];
  console.log(`  · Fila en asistia.usuarios ${creado ? "creada" : "actualizada"}: ${id}`);
  console.log(`
  ✓ Listo. Entra en http://localhost:3000/login con ${email}
    Rol: ${rol}${clientKey ? ` · Empresa: ${clientKey}` : " · ve todas las empresas"}
`);

  if (passwordGenerada) {
    console.log(`    Contraseña generada (se muestra UNA vez, no queda guardada):

        ${password}

    Pásasela por un canal seguro y que la cambie al entrar.
`);
  }
} catch (e) {
  // Los errores de constraint del esquema, traducidos.
  const m = e.message ?? String(e);
  if (/usuarios_un_admin_por_empresa/.test(m)) {
    salir("Esa empresa ya tiene un ADMIN_EMPRESA. El esquema solo permite uno.");
  }
  if (/usuarios_email_key/.test(m)) {
    salir(`Ya hay una fila con el correo ${email} enlazada a otra cuenta de Auth.`);
  }
  if (/usuarios_check/.test(m)) {
    salir(
      "El esquema rechaza la combinación rol/empresa: INTERSIM va sin empresa, " +
        "ADMIN_EMPRESA siempre con una."
    );
  }
  salir(m);
} finally {
  await cliente.end().catch(() => {});
}
