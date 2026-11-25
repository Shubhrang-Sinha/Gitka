"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const destinations = [
    { label: "Overview", href: base },
    { label: "Pull requests", href: `${base}/pulls` },
    { label: "Team chat", href: `${base}/chat` },
    { label: "Codebase Q&A", href: `${base}/qa` },
  ];

  return (
    <nav aria-label="Project tools" className="-mb-px grid grid-cols-2 gap-x-2 sm:flex sm:flex-wrap sm:gap-x-3">
      {destinations.map(({ label, href }) => {
        const exact = pathname === href;
        const active = exact || (href !== base && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={exact ? "page" : active ? "location" : undefined}
            className={`inline-flex min-h-11 items-center border-b-2 px-2.5 text-sm font-semibold transition-colors hover:text-accent sm:px-3 ${active ? "border-accent text-accent" : "border-transparent text-muted"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
