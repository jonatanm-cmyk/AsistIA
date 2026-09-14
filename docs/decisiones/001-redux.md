# 001 · Estado de cliente: por ahora sin Redux

**Fecha:** 11-sep-2026 · **Estado:** decidido, revisable · **Alcance:** backoffice de AsistIA

---

## Decisión

No adoptamos Redux todavía. El estado compartido vive en la URL, el local en su
componente, y los datos en el servidor.

---

## Contexto

Medido sobre el código actual:

| | |
|---|---|
| Componentes de cliente | 16 de 32 |
| `useState` totales | 28 |
| `useEffect` totales | 5 |
| Archivos con estado en la URL | 7 |

Lo que guardan esos 28 `useState`: booleanos de *confirmando* y *saliendo*,
campos de formulario, un índice de hover en el gráfico, y un único array real
—`ReglaUI[]`, en el editor del agente.

**Ninguno se comparte entre componentes.** Lo que sí es compartido —periodo,
filtros, paginación— ya está en la URL: un store global con historial, enlace
compartible y cero bundle.

---

## Por qué no aún

**1. No hay estado compartido que gestionar.** Redux resuelve el problema de
que varios componentes lejanos necesiten el mismo dato mutable. Hoy eso no
ocurre ni una vez.

**2. No puede sostener los datos de las vistas.** Los Server Components no pasan
por Redux; su resultado viaja en el payload RSC. Meter los datos en el store
obliga a una de dos, y las dos son peores:

- *Hidratar desde props*: serializar lo mismo dos veces, en el payload y en el
  estado inicial.
- *RTK Query*: mover la obtención de datos al navegador. Eso añade una ida y
  vuelta HTTP sobre los ~130 ms de latencia a Supabase que ya pagamos, y pierde
  el streaming: la vista se pinta vacía y luego se rellena. Hoy el HTML llega
  con los datos dentro.

**3. El coste no es despreciable.** `@reduxjs/toolkit` + `react-redux` son ~45 kB
comprimidos sobre un bundle compartido de 103 kB: un 44 % más. Y cada pieza de
estado que entra al store sale de su componente, que pasa a leerse repartido
entre un slice, un selector y un dispatch.

---

## Cuándo sí

Revisar esta decisión cuando ocurra **cualquiera** de estas tres:

1. **Tiempo real.** Si conectamos Supabase Realtime —estado de ingesta,
   conversaciones que se actualizan solas— aparece estado de cliente vivo,
   compartido y dirigido por eventos. *Es el disparador más probable.*
2. **El editor del agente crece**: reordenar arrastrando, deshacer/rehacer,
   vista previa del prompt ensamblado, aviso al salir con cambios sin guardar.
3. **Dos componentes que no son padre e hijo** necesitan el mismo estado de
   cliente y no cabe en la URL.

---

## Qué probaríamos antes

| Necesidad | Alternativa |
|---|---|
| Máquina de estados dentro de un componente | `useReducer` |
| Avisos globales tipo *toast* | Context, ~30 líneas |
| Store global de verdad (caso 1 o 2) | **Zustand**: ~3 kB, sin providers ni slices |

La ceremonia de Redux se paga cuando mucha gente toca mucho estado. Aquí somos
dos.

---

## Si algún día se hace: la trampa que hay que evitar

El store **tiene que crearse por petición**. Un store a nivel de módulo en el
servidor se comparte entre todas las peticiones, y en una app multi-empresa eso
significa que los datos de una empresa pueden aparecer en el render de otra. Es
la misma clase de fuga que evita el `set_config(..., true)` de `src/lib/db.ts`,
en el otro extremo de la pila.

```ts
// ❌ nunca
export const store = configureStore({ reducer });

// ✅ uno por montaje
export const makeStore = () => configureStore({ reducer });

// StoreProvider.tsx  ("use client"), colgando de AppShell
const ref = useRef<AppStore>();
if (!ref.current) ref.current = makeStore();
return <Provider store={ref.current}>{children}</Provider>;
```

Colgarlo de `AppShell` —que ya es cliente— mantiene las páginas como Server
Components.
