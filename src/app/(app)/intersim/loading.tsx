import { Skeleton, SkeletonGrafico, SkeletonTarjeta } from "@/components/ui";

/**
 * Lo que se ve mientras la ruta carga. Next lo muestra en cuanto empieza la
 * navegación, sin esperar a ninguna consulta, así que el clic en el menú tiene
 * respuesta inmediata aunque la base tarde.
 */
export default function Cargando() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
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
    </>
  );
}
