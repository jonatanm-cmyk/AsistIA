import Link from "next/link";
import { FileQuestion } from "lucide-react";

export const metadata = { title: "No encontrado" };

export default function NoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card card-pad max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-ink-soft">
          <FileQuestion className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-bold text-ink">Aquí no hay nada</h1>
        <p className="mt-2 text-sm text-ink-soft">
          La página no existe, o el registro que buscabas no es de tu empresa.
        </p>
        <Link href="/" className="btn-primary mt-5 inline-flex">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
