import { Skeleton, SkeletonGrafico, SkeletonTarjeta } from "./index";

/**
 * Esqueletos de página completa, para los `loading.tsx`.
 *
 * POR QUÉ IMPORTAN MÁS DE LO QUE PARECE
 *
 * Next muestra `loading.tsx` EN CUANTO se hace clic, sin esperar al servidor.
 * Sin él, el navegador se queda en la vista anterior mientras la nueva se
 * resuelve: el clic parece no haber hecho nada, y desde aquí eso son entre
 * medio segundo y un segundo y medio de pantalla congelada, porque cada
 * consulta a Supabase cuesta ~130 ms de ida y vuelta.
 *
 * El esqueleto no acelera nada. Cambia otra cosa: que la aplicación responda
 * al clic. Es la diferencia entre "va lenta" y "está rota".
 *
 * Están centralizados aquí para que añadir una vista sea un `loading.tsx` de
 * tres líneas y no un esqueleto escrito a mano que se desincroniza del diseño.
 */

type Variante = "dashboard" | "formulario" | "tabla" | "detalle";

export default function EsqueletoPagina({ variante }: { variante: Variante }) {
  return (
    <>
      <Cabecera />
      {variante === "dashboard" && <Dashboard />}
      {variante === "formulario" && <Formulario />}
      {variante === "tabla" && <Tabla />}
      {variante === "detalle" && <Detalle />}
    </>
  );
}

function Cabecera() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
    </div>
  );
}

function Dashboard() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SkeletonTarjeta />
        <SkeletonTarjeta />
        <SkeletonTarjeta />
        <SkeletonTarjeta />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SkeletonGrafico />
        </div>
        <SkeletonGrafico alto="h-52" />
      </div>
    </div>
  );
}

function Formulario() {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Skeleton className="h-52 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}

function Tabla() {
  return (
    <div className="card overflow-hidden">
      <div className="space-y-3 p-5">
        {/* Anchos decrecientes: una pila de barras idénticas se lee como un
            bloque; escalonadas se leen como filas. */}
        {[100, 92, 96, 88, 94, 90, 86].map((ancho, i) => (
          <Skeleton key={i} className="h-9" style={{ width: `${ancho}%` }} />
        ))}
      </div>
    </div>
  );
}

function Detalle() {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Skeleton className="h-96 w-full rounded-2xl xl:col-span-2" />
      <div className="space-y-5">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    </div>
  );
}
