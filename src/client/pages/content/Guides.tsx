import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../lib/hooks';
import { GUIDES } from './guideData';

export default function Guides() {
  useDocumentTitle('Guides');
  return (
    <main id="main" className="mx-auto max-w-[880px] px-4 py-14 sm:px-6 sm:py-20">
      <p className="label-mono">Guides</p>
      <h1 className="mt-3 text-[44px] leading-tight text-ink">Checking a job before you apply</h1>
      <p className="mt-4 max-w-[58ch] text-[17px] text-ink-2">Short, practical notes on the things we check, so you can do it yourself whenever you want to.</p>
      <ul className="mt-12 divide-y divide-line border-y border-line">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link to={`/guides/${g.slug}`} className="group grid gap-1 py-6 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-8">
              <div>
                <h2 className="text-[25px] text-ink group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{g.title}</h2>
                <p className="mt-1 text-[15px] text-muted">{g.summary}</p>
              </div>
              <span className="font-mono text-[12px] text-faint">{g.minutes} min read</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
