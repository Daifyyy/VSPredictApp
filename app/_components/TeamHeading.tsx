import Link from "next/link";
import { TeamLogo } from "./TeamLogo";

export function TeamHeading({
  name,
  logo,
  accent,
  alignRight,
  href,
}: {
  name: string;
  logo: string;
  accent: "home" | "away";
  alignRight?: boolean;
  href?: string;
}) {
  const color = accent === "home" ? "text-home" : "text-away";
  const content = (
    <>
      <span className="shrink-0">
        <span className="sm:hidden">
          <TeamLogo src={logo} alt={name} size={32} />
        </span>
        <span className="hidden sm:inline">
          <TeamLogo src={logo} alt={name} size={48} />
        </span>
      </span>
      <span className={`truncate text-sm font-semibold sm:text-base ${color}`}>
        {name}
      </span>
    </>
  );
  const className = `flex min-w-0 flex-1 items-center gap-2 sm:flex-col sm:gap-1.5 ${
        alignRight ? "flex-row-reverse text-right sm:text-center" : "sm:text-center"
      } ${href ? "rounded-lg outline-none transition hover:bg-background focus-visible:ring-2 focus-visible:ring-accent-strong" : ""}`;

  return href ? (
    <Link href={href} className={className} aria-label={`Otevřít profil týmu ${name}`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
