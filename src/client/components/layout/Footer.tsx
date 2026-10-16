import { Link } from 'react-router-dom';
import { Logo } from '../ui/marks';

const COLS = [
  { title: 'Product', links: [['Check a job', '/check'], ['How it works', '/how-it-works'], ['Pricing', '/pricing'], ['Methodology', '/methodology']] },
  { title: 'Guides', links: [['What is a ghost job?', '/guides/what-is-a-ghost-job'], ['Spotting fake postings', '/guides/how-to-spot-a-fake-job-posting'], ['Researching layoffs', '/guides/how-to-research-company-layoffs'], ['All guides', '/guides']] },
  { title: 'The fine print', links: [['FAQ', '/faq'], ['Privacy', '/privacy'], ['Terms', '/terms'], ['Report a mistake', '/report-a-problem']] },
];

export function Footer() {
  return (
    <footer className="no-print mt-24 border-t border-line">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.3fr_repeat(3,1fr)]">
        <div>
          <Link to="/" className="flex items-center gap-2 text-ink">
            <Logo className="size-6" />
            <span className="font-serif text-[19px]">JobSignal</span>
          </Link>
          <p className="mt-3 max-w-[34ch] text-[13.5px] text-muted">
            Checks job postings and the companies behind them using public records. It's decision support, not a verdict. We can be wrong, and we'll say when we don't know.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="label-mono">{c.title}</p>
            <ul className="mt-3 space-y-2 text-[14px]">
              {c.links.map(([label, to]) => (
                <li key={to}><Link to={to!} className="text-ink-2 hover:text-ink">{label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[12.5px] text-faint sm:px-6">
          <span>© {new Date().getFullYear()} JobSignal. Not affiliated with any employer or job board we check.</span>
          <span>Public data from Greenhouse, Lever, Ashby, SEC EDGAR, and state WARN offices.</span>
        </div>
      </div>
    </footer>
  );
}
