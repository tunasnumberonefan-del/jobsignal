import { useState } from 'react';
import { toast } from 'sonner';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Field, Input, Select, Textarea } from '../ui/form';

const REASONS: Array<[string, string]> = [
  ['wrong_company', 'This is matched to the wrong company'],
  ['wrong_event', 'A layoff or filing listed here is wrong'],
  ['outdated', 'Something is out of date'],
  ['listing_is_real', "The listing is real and the report suggests otherwise"],
  ['listing_is_fake', 'The listing is a scam and the report missed it'],
  ['other', 'Something else'],
];

export function FlagDialog({ open, onOpenChange, slug, companySlug }: { open: boolean; onOpenChange: (o: boolean) => void; slug?: string; companySlug?: string }) {
  const [reason, setReason] = useState('wrong_event');
  const [detail, setDetail] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/api/flags', { slug, companySlug, reason, detail, contactEmail: email || undefined });
      toast.success('Thanks. A person will look at this.');
      onOpenChange(false);
      setDetail('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Tell us what's wrong"
      description="Employers and job seekers can both use this. We review every report and correct or hide records that don't hold up."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={submit} loading={busy} disabled={detail.trim().length < 10}>Send</Button></>}
    >
      <div className="space-y-4">
        <Field label="What's the problem?" htmlFor="flag-reason">
          <Select id="flag-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Details" htmlFor="flag-detail" hint="Links to a source help a lot." error={err}>
          <Textarea id="flag-detail" rows={4} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={4000} />
        </Field>
        <Field label="Email (optional)" htmlFor="flag-email" hint="Only if you'd like to hear back.">
          <Input id="flag-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function Feedback({ slug }: { slug: string }) {
  const [sent, setSent] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [showBox, setShowBox] = useState(false);
  const send = async (helpful: boolean, withComment?: string) => {
    try {
      await api.post('/api/feedback', { slug, helpful, comment: withComment || undefined });
      setSent(helpful);
      if (withComment) {
        setShowBox(false);
        toast.success('Got it, thank you.');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (sent !== null && !showBox) {
    return (
      <p className="text-[14px] text-muted">
        Thanks for telling us.{' '}
        {!comment && <button className="link text-ink" onClick={() => setShowBox(true)}>Add a note?</button>}
      </p>
    );
  }
  return (
    <div>
      {!showBox ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-ink-2">Was this report useful?</span>
          <Button size="sm" variant="secondary" icon={<ThumbsUp className="size-3.5" />} onClick={() => send(true)}>Yes</Button>
          <Button size="sm" variant="secondary" icon={<ThumbsDown className="size-3.5" />} onClick={() => { setSent(false); setShowBox(true); }}>Not really</Button>
        </div>
      ) : (
        <div className="max-w-[520px] space-y-2">
          <label htmlFor="fb-c" className="text-[14px] text-ink-2">What would have made it more useful?</label>
          <Textarea id="fb-c" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => send(sent ?? false, comment)} disabled={!comment.trim()}>Send</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowBox(false)}>Skip</Button>
          </div>
        </div>
      )}
    </div>
  );
}
