import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Textarea } from '../../components/ui/form';
import { api, ApiError } from '../../lib/api';
import { ContentPage } from './Page';

/** General contact + correction form. Writes to the same review queue as in-report flags. */
export default function ReportProblem() {
  const [link, setLink] = useState('');
  const [reason, setReason] = useState('wrong_event');
  const [detail, setDetail] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const slug = link.match(/\/r\/([a-z0-9]{8,20})/)?.[1];
    const companySlug = link.match(/\/companies\/([a-z0-9-]+)/)?.[1];
    if (!slug && !companySlug) {
      setErr('Paste the link to the JobSignal report or company page this is about.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/flags', { slug, companySlug, reason, detail, contactEmail: email || undefined });
      setDone(true);
      toast.success('Sent. Thank you.');
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ContentPage kicker="Corrections" title="Report a problem" intro="Wrong company match, an outdated record, a listing we got wrong, or something else. A person reads every one of these." cta={false}>
      {done ? (
        <p>Thanks. If you left an email, we'll write back once we've looked into it.</p>
      ) : (
        <form onSubmit={submit} className="not-prose space-y-5" noValidate>
          <Field label="Link to the report or company page" htmlFor="rp-link" hint="For example jobsignal.app/r/abc123 or /companies/acme">
            <Input id="rp-link" value={link} onChange={(e) => setLink(e.target.value)} />
          </Field>
          <Field label="What's wrong?" htmlFor="rp-reason">
            <Select id="rp-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="wrong_company">Matched to the wrong company</option>
              <option value="wrong_event">A record listed is wrong</option>
              <option value="outdated">Something is out of date</option>
              <option value="listing_is_real">The listing is real and the report suggests otherwise</option>
              <option value="listing_is_fake">The listing is a scam and the report missed it</option>
              <option value="other">Something else</option>
            </Select>
          </Field>
          <Field label="Details" htmlFor="rp-detail" hint="Links to sources help us move faster." error={err}>
            <Textarea id="rp-detail" rows={6} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={4000} />
          </Field>
          <Field label="Your email (optional)" htmlFor="rp-email" hint="Only if you'd like a reply.">
            <Input id="rp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} disabled={detail.trim().length < 10}>Send</Button>
        </form>
      )}
    </ContentPage>
  );
}
