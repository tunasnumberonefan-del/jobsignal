import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NotFound } from '../NotFound';
import { ContentPage } from './Page';
import { GUIDES } from './guideData';

export default function GuidePage() {
  const { slug } = useParams();
  const g = GUIDES.find((x) => x.slug === slug);
  // Article structured data for search engines. Only on real guide pages.
  useEffect(() => {
    if (!g) return;
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.summary, publisher: { '@type': 'Organization', name: 'JobSignal' } });
    document.head.appendChild(s);
    const meta = document.querySelector('meta[name="description"]');
    const prev = meta?.getAttribute('content');
    meta?.setAttribute('content', g.summary);
    return () => {
      s.remove();
      if (prev) meta?.setAttribute('content', prev);
    };
  }, [g]);
  if (!g) return <NotFound />;
  const others = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 3);
  return (
    <ContentPage kicker={`Guide · ${g.minutes} min read`} title={g.title} intro={g.summary}>
      {g.body}
      <div className="not-prose mt-14 border-t border-line pt-8">
        <p className="label-mono">Keep reading</p>
        <ul className="mt-3 space-y-2">
          {others.map((o) => <li key={o.slug}><Link to={`/guides/${o.slug}`} className="link text-[16px] text-ink">{o.title}</Link></li>)}
        </ul>
      </div>
    </ContentPage>
  );
}
