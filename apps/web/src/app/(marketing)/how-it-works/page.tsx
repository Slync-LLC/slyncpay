import Link from "next/link";

const STEPS = [
  {
    step: "01",
    title: "Sign up and get your API key",
    description:
      "Create an account, connect a bank account for your first entity, and receive your live API key in under 5 minutes. No contracts, no setup fees.",
    code: `POST /v1/auth/signup
{
  "companyName": "Acme Staffing",
  "email": "cto@acme.com",
  "plan": "starter"
}
// → { "apiKey": "spk_live_..." }`,
  },
  {
    step: "02",
    title: "Onboard your first contractor",
    description:
      "POST one API call with your contractor's name and email. SlyncPay sends them a branded W-9 collection and bank account setup flow. You get a webhook when they're ready to be paid.",
    code: `POST /v1/contractors
Authorization: Bearer spk_live_...

{
  "externalId": "nurse-jane-001",
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Smith"
}
// → Wingspan account created. W-9 invite sent.`,
  },
  {
    step: "03",
    title: "Create payables as work happens",
    description:
      "Every shift, project, or milestone creates a payable. Attach it to the correct legal entity for proper 1099 tracking. Use your own reference IDs — SlyncPay maps them for you.",
    code: `POST /v1/payables
Idempotency-Key: shift-9021-payment

{
  "contractorId": "{{jane_id}}",
  "entityId": "{{az_entity_id}}",
  "externalReferenceId": "SHIFT-9021",
  "lineItems": [
    { "description": "ICU shift 4/19", "quantity": 1, "unitAmount": 450 }
  ]
}`,
  },
  {
    step: "04",
    title: "Trigger disbursement — one call, all contractors",
    description:
      "When you're ready to pay, one POST sweeps all pending payables for an entity into a payroll batch. Contractors get paid. Your webhook fires when each payment settles.",
    code: `POST /v1/disbursements
Idempotency-Key: az-batch-2026-04-19

{
  "entityId": "{{az_entity_id}}"
}
// → 14 contractors paid. Total: $24,500.
// webhook: disbursement.completed`,
  },
];

const FEATURES = [
  {
    title: "Multi-entity, multi-EIN",
    desc: "Each of your legal entities gets its own Wingspan sub-account. Payables are attributed to the correct EIN, so 1099s are accurate without any manual reconciliation.",
  },
  {
    title: "Idempotent by design",
    desc: "Every write operation accepts an Idempotency-Key header. Re-send the same request safely — SlyncPay returns the original response without re-issuing payment.",
  },
  {
    title: "Webhooks with HMAC verification",
    desc: "Every outgoing webhook is signed with your endpoint's secret key. Verify the SlyncPay-Signature header to ensure events aren't spoofed.",
  },
  {
    title: "1099-NEC auto-filing",
    desc: "At year-end, SlyncPay generates and e-files 1099-NEC forms for every contractor earning $600+, organized by entity. No spreadsheets, no manual uploads.",
  },
  {
    title: "Instant onboarding links",
    desc: "GET /contractors/:id/onboarding-link returns a fresh Wingspan session URL for any contractor. Embed it in your app or send it directly.",
  },
  {
    title: "Test mode built in",
    desc: "Every account gets both live and test API keys. The test environment mirrors production with fake Wingspan staging data — no real money moves.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="font-bold text-xl tracking-tight">SlyncPay</Link>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/sign-in" className="hover:text-foreground transition-colors">Sign in</Link>
          <Link href="/sign-up" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Four API calls to first payment</h1>
        <p className="text-xl text-muted-foreground">
          SlyncPay handles the Wingspan complexity so you don't have to.
          Onboard contractors, create payables, and trigger disbursements with a clean REST API.
        </p>
      </section>

      {/* Steps */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="space-y-12">
          {STEPS.map(({ step, title, description, code }) => (
            <div key={step} className="grid md:grid-cols-2 gap-8 items-start">
              <div>
                <div className="text-primary font-mono text-sm font-bold mb-3">{step}</div>
                <h2 className="text-2xl font-bold mb-3">{title}</h2>
                <p className="text-muted-foreground leading-relaxed">{description}</p>
              </div>
              <div className="bg-zinc-950 rounded-xl p-5 text-sm font-mono text-zinc-300 overflow-x-auto">
                <pre className="whitespace-pre-wrap">{code}</pre>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/40 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-3">Built for production from day one</h2>
          <p className="text-center text-muted-foreground mb-12">
            Every SlyncPay feature is designed for the correctness requirements of real payroll.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {FEATURES.map(({ title, desc }) => (
              <div key={title} className="bg-white rounded-xl p-5 border border-border">
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to integrate?</h2>
        <p className="text-muted-foreground mb-8">
          Get your API key in 5 minutes. 14-day free trial. No credit card required.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up" className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90 transition-opacity">
            Start for free
          </Link>
          <Link href="/pricing" className="border border-border px-6 py-3 rounded-md font-medium hover:bg-muted transition-colors">
            View pricing
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6 text-center text-sm text-muted-foreground">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="font-semibold text-foreground">SlyncPay</span>
          <div className="flex gap-6">
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/how-it-works" className="hover:text-foreground">How it works</Link>
            <a href="mailto:support@slyncpay.com" className="hover:text-foreground">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
