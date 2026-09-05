import Link from "next/link";

export const dynamic = "force-static";
export default function OfflinePage() { return <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-5 text-center"><p className="page-kicker">Offline</p><h1 className="mt-2 text-2xl font-bold">Aplikaci se nepodařilo obnovit</h1><p className="mt-3 text-sm text-muted">Zkontroluj připojení. Po jeho obnovení načti aktuální verzi aplikace znovu.</p><Link href="/" className="ui-button-primary mt-5 px-5 py-3">Načíst znovu</Link></main>; }
