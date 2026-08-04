import Link from "next/link";

const MESSAGES: Record<string, { title: string; text: string }> = {
  Configuration: {
    title: "Přihlášení není správně nastavené",
    text: "Nesouhlasí konfigurace přihlašovací služby. Zkontrolujeme produkční adresu a Google OAuth callback.",
  },
  AccessDenied: {
    title: "Přístup byl zamítnut",
    text: "Google účet přihlášení nepotvrdil nebo nemá povolený přístup.",
  },
  OAuthCallbackError: {
    title: "Google přihlášení se nedokončilo",
    text: "Ověření se vrátilo s chybou. Zkus přihlášení znovu; pokud problém trvá, zkontrolujeme callback adresu.",
  },
  AdapterError: {
    title: "Účet se nepodařilo uložit",
    text: "Přihlášení proběhlo, ale databáze nemohla vytvořit účet nebo relaci.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const message = MESSAGES[error ?? ""] ?? {
    title: "Přihlášení se nezdařilo",
    text: "Zkus to prosím znovu. Pokud chyba pokračuje, poznamenej si její kód.",
  };
  const safeReturn = callbackUrl?.startsWith("/") ? callbackUrl : "/";

  return (
    <main className="grid min-h-screen place-items-center bg-background p-4">
      <section className="ui-panel w-full max-w-md p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-negative/10 text-xl font-bold text-negative" aria-hidden>!</span>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{message.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{message.text}</p>
        {error && <p className="mt-3 text-xs text-muted">Kód chyby: <code>{error}</code></p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={safeReturn} className="ui-control inline-flex items-center justify-center px-4 text-sm font-semibold text-foreground">Zpět do aplikace</Link>
          <Link href="/api/auth/signin" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-positive px-4 text-sm font-semibold text-white">Zkusit znovu</Link>
        </div>
      </section>
    </main>
  );
}
