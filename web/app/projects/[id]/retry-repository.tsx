"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function RetryRepository({ section }: { section: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-danger">Could not load the {section} from Forgejo.</p>
      <button
        type="button"
        className="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "Retrying…" : `Retry ${section}`}
      </button>
    </div>
  );
}
