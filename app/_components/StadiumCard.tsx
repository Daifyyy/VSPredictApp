"use client";

import Image from "next/image";
import { useState } from "react";
import type { TeamStadium } from "@/lib/types";

export function StadiumCard({ stadium }: { stadium: TeamStadium }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(stadium.imageUrl) && !imageFailed;
  const location = [stadium.address, stadium.city].filter(Boolean).join(", ");

  return (
    <section className="ui-panel mt-4 overflow-hidden" aria-labelledby="stadium-title">
      <div className={`grid ${showImage ? "md:grid-cols-[minmax(280px,.9fr)_1.1fr]" : ""}`}>
        {showImage ? (
          <div className="relative min-h-48 bg-border md:min-h-56">
            <Image
              src={stadium.imageUrl!}
              alt={stadium.name ? `Stadion ${stadium.name}` : "Domácí stadion"}
              fill
              sizes="(max-width: 768px) 100vw, 520px"
              className="object-cover"
              onError={() => setImageFailed(true)}
            />
          </div>
        ) : null}
        <div className="flex flex-col justify-center p-5 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[.12em] text-muted">Domácí stadion</p>
          <h2 id="stadium-title" className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {stadium.name ?? "Stadion není uveden"}
          </h2>
          {location ? <p className="mt-2 text-sm text-muted">{location}</p> : null}
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {stadium.capacity ? (
              <div className="rounded-xl border border-border bg-background p-3">
                <dt className="text-xs font-semibold text-muted">Kapacita</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-foreground">
                  {new Intl.NumberFormat("cs-CZ").format(stadium.capacity)} diváků
                </dd>
              </div>
            ) : null}
            {stadium.surface ? (
              <div className="rounded-xl border border-border bg-background p-3">
                <dt className="text-xs font-semibold text-muted">Povrch</dt>
                <dd className="mt-1 text-lg font-bold text-foreground">{stadium.surface}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </section>
  );
}
