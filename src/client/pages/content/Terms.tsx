import { Link } from 'react-router-dom';
import { ContentPage } from './Page';

export default function Terms() {
  return (
    <ContentPage kicker="Terms" title="Terms of service" intro="Plain-language terms for using JobSignal. Please read the part about what reports are and aren't. It matters." updated="October 15, 2026" cta={false}>
      <h2>What JobSignal is</h2>
      <p>
        JobSignal collects publicly available information about job postings and employers and organizes it into reports. Reports are <strong>decision-support information</strong>. They are not legal, financial, or employment advice, and they aren't a statement of fact about whether a particular job is real, available, or secure.
      </p>
      <p>
        Reports describe observable signals and public records at the time they were generated. Public sources can be incomplete, delayed, or wrong, and our matching of records to companies, while conservative, can make mistakes. A report showing no warning signs is not a guarantee about an employer, and a report showing caution signals is not an accusation.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You need a working email address to create an account. Keep access to it secure, since it's how you sign in.</li>
        <li>One person per account. Don't share accounts or resell access.</li>
        <li>You can delete your account at any time from Account → Privacy & data.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Please don't:</p>
      <ul>
        <li>Use automated tools to run large numbers of checks or scrape JobSignal.</li>
        <li>Try to get around usage limits, rate limits, or plan restrictions.</li>
        <li>Submit links designed to probe or attack our systems or anyone else's.</li>
        <li>Use reports to harass employers or individuals, or present them as something they aren't (for example, cropping a report to claim a company is fraudulent).</li>
      </ul>
      <p>We may suspend accounts that do these things.</p>

      <h2>Subscriptions</h2>
      <ul>
        <li>Pro is billed monthly in advance through our payment provider, Stripe, and renews automatically until you cancel.</li>
        <li>You can cancel any time from Account → Billing. You keep Pro until the end of the period you've paid for.</li>
        <li>If a payment fails, Stripe retries for a while. If it still fails, your account goes back to the free plan.</li>
        <li>We may change prices with advance notice. Changes apply from your next billing period.</li>
        <li>Plan limits (such as the number of checks) are described on the <Link to="/pricing">pricing page</Link> and may change over time.</li>
      </ul>

      <h2>For employers</h2>
      <p>
        If you think a report or company profile contains an error about your organization, please use the <Link to="/report-a-problem">report a problem</Link> page. We review every request and correct or hide records that are mismatched or inaccurate. We can't remove accurate public records just because they're unflattering.
      </p>

      <h2>Third-party content</h2>
      <p>
        Job descriptions and records belong to their respective owners. We show them to explain our findings and link back to the original sources. Links to other sites are provided for convenience; we're not responsible for their content.
      </p>

      <h2>Disclaimers and limits</h2>
      <p>
        JobSignal is provided "as is" without warranties of any kind, to the extent the law allows. We aren't liable for decisions you make based on a report, or for indirect or consequential losses. If we're found liable for something, our total liability is limited to what you paid us in the 12 months before the claim.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change is significant, we'll update the date above and let account holders know.</p>
    </ContentPage>
  );
}
