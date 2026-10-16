import { useSearchParams } from 'react-router-dom';
import { AnalyzeForm } from '../components/report/AnalyzeForm';
import { useConfig, useDocumentTitle } from '../lib/hooks';

export function CheckPage() {
  useDocumentTitle('Check a job posting');
  const [params] = useSearchParams();
  const { data: cfg } = useConfig();
  return (
    <main id="main" className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 sm:py-16">
      <p className="label-mono">New check</p>
      <h1 className="mt-3 text-[40px] leading-tight text-ink">What job are you looking at?</h1>
      <p className="mt-3 max-w-[56ch] text-[16.5px] text-muted">
        Paste the link to the listing. The best links are the ones on the company's own job board, not a copy on an aggregator site.
      </p>
      <div className="mt-8">
        <AnalyzeForm autoFocus initialUrl={params.get('url') ?? undefined} />
      </div>
      <div className="mt-12 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-[20px] text-ink">Links we read directly</h2>
          <ul className="mt-3 space-y-2 text-[14px]">
            {(cfg?.supportedSources ?? []).map((s) => (
              <li key={s.name}>
                <span className="text-ink">{s.name}</span>
                <span className="block font-mono text-[12px] text-faint">{s.example}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-[20px] text-ink">Found it on LinkedIn or Indeed?</h2>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">
            Those sites don't allow automated checks, and they often show copies of listings from elsewhere. Click through to "Apply on company site" and paste that link instead. If there's no company link at all, that's worth noticing too.
          </p>
        </div>
      </div>
    </main>
  );
}
