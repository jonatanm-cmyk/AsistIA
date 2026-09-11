import Link from "next/link";
import { ShieldOff } from "lucide-react";

export const metadata = { title: "Sin permiso" };

export default function SinPermiso() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="card card-pad max-w-md text-center">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-ink-soft">
          <ShieldOff className="h-6 w-6" />
        </span>
        <h1 className="text-lg font-bold text-ink">Esta vista no es para tu cuenta</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Tu usuario no tiene permiso para entrar aquí. Si crees que es un error, habla con
          quien administra la cuenta.
        </p>
        <Link href="/" className="btn-primary mt-5 inline-flex">
          Volver a mi inicio
        </Link>
      </div>
    </main>
  );
}
