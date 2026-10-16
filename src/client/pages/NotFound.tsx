import { ButtonLink } from '../components/ui/button';
import { useDocumentTitle } from '../lib/hooks';

export function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <main id="main" className="mx-auto max-w-[640px] px-4 py-24 sm:px-6">
      <p className="hand text-[28px] text-caution -rotate-2">hm.</p>
      <h1 className="mt-2 text-[40px] leading-tight text-ink">This page isn't here</h1>
      <p className="mt-3 text-[16px] text-muted">
        Maybe the link was mistyped, or the page moved. Ironically, that's also how a lot of old job listings end up.
      </p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/">Home</ButtonLink>
        <ButtonLink to="/check" variant="secondary">Check a job</ButtonLink>
      </div>
    </main>
  );
}
