import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import logoLight from "@/assets/playready-logo-light.jpg";
import logoDark from "@/assets/playready-logo-dark.jpg";

const Section = ({ n, title, children }: { n: string; title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="font-display font-bold text-xl tracking-tight">
      <span className="text-muted-foreground mr-2 tabular-nums">{n}</span>{title}
    </h2>
    <div className="text-sm text-muted-foreground leading-relaxed space-y-2.5">{children}</div>
  </section>
);

const Terms = () => (
  <main className="min-h-screen bg-background">
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-[760px] mx-auto px-5 h-14 flex items-center gap-3">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2">
          <img src={logoLight} alt="" className="w-7 h-7 rounded-lg object-cover dark:hidden" />
          <img src={logoDark} alt="" className="w-7 h-7 rounded-lg object-cover hidden dark:block" />
          <h1 className="font-display font-bold text-lg tracking-tight">Terms & Conditions</h1>
        </div>
      </div>
    </header>

    <article className="max-w-[760px] mx-auto px-5 py-10 space-y-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Last updated · May 2026</p>
        <h2 className="display-xl text-[40px] mt-2 leading-[0.95]">
          The rules of the<br/><span className="italic font-display">match.</span>
        </h2>
        <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-[60ch]">
          These Terms and Conditions ("Terms") govern your access to and use of the PlayReady platform,
          including the website, mobile application, and related services (collectively, the "Service").
          By creating an account or otherwise using the Service, you agree to be bound by these Terms.
          If you do not agree, you must not use the Service.
        </p>
      </div>

      <Section n="1." title="User responsibilities and acceptable use">
        <p>You agree to use the Service only for lawful purposes and in a manner that does not infringe
          the rights of, or restrict the use and enjoyment of the Service by, any third party. You are
          responsible for ensuring that all information you provide — including your name, contact details,
          and any match-related content — is accurate, current and complete.</p>
        <p>You agree to behave respectfully toward other players, organisers and venue operators. Harassment,
          discrimination, threats, hate speech, or any conduct intended to intimidate or harm others is
          strictly prohibited and may result in immediate account suspension.</p>
      </Section>

      <Section n="2." title="Platform liability limitations">
        <p>The Service is provided on an "as is" and "as available" basis. PlayReady makes no warranties,
          express or implied, regarding the availability, reliability, accuracy or fitness for a particular
          purpose of the Service.</p>
        <p>To the fullest extent permitted by applicable law, PlayReady, its officers, directors, employees and
          affiliates shall not be liable for any indirect, incidental, special, consequential or punitive
          damages, including without limitation personal injury sustained during a match, loss of profits,
          data, goodwill, or other intangible losses, resulting from your use of or inability to use the
          Service. Participation in any physical activity organised through the Service is at your own risk.</p>
      </Section>

      <Section n="3." title="Data usage and privacy practices">
        <p>We collect and process personal data such as your name, email address, location, and match
          activity in order to provide and improve the Service. Your data is handled in accordance with our
          Privacy Policy and applicable data protection legislation, including general principles of consumer
          protection and data privacy.</p>
        <p>We do not sell your personal data. We may share limited information with venue operators and
          other players strictly as necessary to facilitate matches you choose to join or organise. You may
          request access to, correction of, or deletion of your personal data at any time.</p>
      </Section>

      <Section n="4." title="Account security responsibilities">
        <p>You are solely responsible for maintaining the confidentiality of your login credentials and for
          all activity that occurs under your account. You agree to notify PlayReady immediately of any
          unauthorised use of your account or any other breach of security.</p>
        <p>PlayReady is not liable for any loss or damage arising from your failure to comply with this
          obligation. We strongly recommend using a strong, unique password and enabling any additional
          security features made available within the Service.</p>
      </Section>

      <Section n="5." title="Match creation and participation">
        <p>Organisers are responsible for ensuring that the matches they create are accurate in description,
          properly priced, and lawful at the chosen venue. Participants are responsible for arriving on time,
          paying any agreed share, and respecting the rules set by the organiser and venue.</p>
        <p>PlayReady acts solely as a facilitator between players, organisers and venues and is not a party
          to any agreement formed between them. Cancellations, no-shows and refunds are governed by the
          policy disclosed at the time of booking.</p>
      </Section>

      <Section n="6." title="Prohibited activities">
        <p>You may not, and may not permit any third party to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Engage in fraudulent activity, including chargebacks, payment fraud or impersonation;</li>
          <li>Use the Service to organise or promote illegal activities;</li>
          <li>Attempt to gain unauthorised access to the Service, other accounts, or related systems;</li>
          <li>Interfere with, disrupt, or place an unreasonable load on the Service;</li>
          <li>Use automated means (bots, scrapers) to access or extract data from the Service;</li>
          <li>Post defamatory, obscene, infringing or otherwise unlawful content.</li>
        </ul>
      </Section>

      <Section n="7." title="Dispute resolution and account suspension">
        <p>PlayReady reserves the right, at its sole discretion, to suspend or terminate your access to the
          Service, with or without notice, if we reasonably believe you have violated these Terms, posed a
          risk to other users, or engaged in conduct that may expose PlayReady to legal liability.</p>
        <p>Any dispute arising out of or in connection with these Terms shall first be addressed through good
          faith negotiations between the parties. If a resolution cannot be reached, the dispute shall be
          submitted to the competent courts of the jurisdiction in which PlayReady is established, unless a
          mandatory consumer protection law in your country of residence provides otherwise.</p>
      </Section>

      <Section n="8." title="Changes to these Terms">
        <p>We may update these Terms from time to time to reflect changes to the Service, applicable law, or
          our business practices. Material changes will be communicated through the Service. Continued use
          of the Service after such changes constitutes your acceptance of the revised Terms.</p>
      </Section>

      <p className="text-xs text-muted-foreground/80 pt-6 border-t border-border">
        For any questions about these Terms or your account, please contact PlayReady support from within the app.
      </p>
    </article>
  </main>
);

export default Terms;