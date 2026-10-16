import { Link } from 'react-router-dom';
import { ContentPage } from './Page';

export default function Privacy() {
  return (
    <ContentPage kicker="Privacy" title="Privacy policy" intro="The short version: we collect as little as we can, we don't sell anything to anyone, and you can download or delete your data whenever you like." updated="October 15, 2026" cta={false}>
      <h2>What we collect</h2>
      <h3>If you don't have an account</h3>
      <ul>
        <li>The job links or text you submit, and the reports we generate from them.</li>
        <li>A random ID stored in a cookie, so you can see the reports you ran. It isn't tied to your name or email.</li>
        <li>A one-way hash of your IP address, used only to enforce the daily free limit and stop abuse. We don't store the IP address itself.</li>
      </ul>
      <h3>If you create an account</h3>
      <ul>
        <li>Your email address, used to sign you in and, if you turn them on, to send alerts.</li>
        <li>An optional name.</li>
        <li>The reports you run, jobs and companies you save, notes, checklists, deadlines, and comparisons.</li>
        <li>Your notification and display preferences.</li>
        <li>If you subscribe: a subscription status and a customer ID from our payment provider. We never see or store your card number.</li>
      </ul>
      <h3>What we don't collect</h3>
      <p>No resumes, cover letters, application answers, phone numbers, or location tracking. No advertising or cross-site tracking cookies.</p>

      <h2>What's public</h2>
      <p>
        Reports are private by default. If you turn on sharing for a report, anyone with the link can see the job, the employer, and the evidence. Shared reports never show who created them. Company profile pages show public records (like WARN notices and SEC filings) about employers, not anything about you.
      </p>

      <h2>Who we share data with</h2>
      <p>We use a small number of service providers to run JobSignal. They process data only to provide their service to us:</p>
      <ul>
        <li><strong>Cloudflare</strong>, for hosting, database, and security.</li>
        <li><strong>Resend</strong>, to send sign-in and alert emails.</li>
        <li><strong>Stripe</strong>, to process payments, if you subscribe.</li>
      </ul>
      <p>We don't sell or rent personal data, and we don't share it for advertising.</p>
      <p>
        When you check a job, we contact the public sources needed for the report (for example the employer's job board, SEC EDGAR, or a state labor department). Those requests come from our servers and don't include anything about you.
      </p>

      <h2>How long we keep things</h2>
      <ul>
        <li>Reports run without an account and never shared: deleted after 30 days.</li>
        <li>Account data: kept until you delete your account.</li>
        <li>Usage counters and request logs: about 30 to 40 days.</li>
        <li>Public job and company records: kept so we can show posting history. These don't contain personal data.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Download your data</strong> from Account → Privacy & data.</li>
        <li><strong>Delete your account</strong> from the same page. This removes your account and everything tied to it right away.</li>
        <li><strong>Turn off emails</strong> in Account → Notifications. Sign-in emails can't be turned off because they're how you sign in.</li>
      </ul>
      <p>
        Depending on where you live, you may have additional rights (such as under the CCPA or GDPR) to access, correct, or delete your information. The tools above cover most of them. For anything else, <Link to="/report-a-problem">contact us</Link>.
      </p>

      <h2>Cookies</h2>
      <p>We use two cookies, both strictly necessary: a sign-in session cookie, and the random visitor ID described above. Your light/dark theme choice is stored in your browser, not on our servers.</p>

      <h2>Children</h2>
      <p>JobSignal is meant for adults looking for work and isn't directed at children under 13.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a meaningful way, we'll update the date at the top and, for account holders, mention it by email or in the app.</p>
    </ContentPage>
  );
}
