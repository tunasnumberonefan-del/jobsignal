import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '../../components/ui/button';
import { useDocumentTitle } from '../../lib/hooks';

export function ContentPage({ kicker, title, intro, children, cta = true, updated }: { kicker: string; title: string; intro?: ReactNode; children: ReactNode; cta?: boolean; updated?: string }) {
  useDocumentTitle(title);
  return (
    <main id="main" className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20">
      <p className="label-mono">{kicker}</p>
      <h1 className="mt-3 text-[40px] leading-[1.1] text-ink sm:text-[48px]">{title}</h1>
      {intro && <p className="mt-5 text-[18.5px] leading-relaxed text-ink-2 font-serif">{intro}</p>}
      {updated && <p className="mt-4 font-mono text-[12px] text-faint">Last updated {updated}</p>}
      <div className="prose-page mt-10">{children}</div>
      {cta && (
        <div className="mt-16 flex flex-col items-start gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-serif text-[22px] text-ink">Have a listing you're unsure about?</p>
          <ButtonLink to="/check" icon={<ArrowRight className="size-4" />}>Check it, free</ButtonLink>
        </div>
      )}
    </main>
  );
}
