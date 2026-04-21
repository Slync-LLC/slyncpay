import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <span className="font-bold text-xl tracking-tight">SlyncPay</span>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/sign-in" className="hover:text-foreground transition-colors">Sign in</Link>
          <Link href="/sign-up" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground mb-6">
          Contractor payments,<br />handled.
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          SlyncPay gives your engineering team a single API to onboard contractors, send payments,
          and file 1099s — backed by enterprise-grade payment rails.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/sign-up" className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90 transition-opacity">
            Start for free
          </Link>
          <Link href="/how-it-works" className="border border-border px-6 py-3 rounded-md font-medium hover:bg-muted transition-colors">
            See how it works
          </Link>
        </div>
      </section>

      {/* Code snippet */}
      <section className="max-w-3xl mx-auto px-6 pb-24">
        <div className="bg-zinc-950 rounded-xl p-6 text-sm font-mono text-zinc-300 overflow-x-auto">
          <div className="text-zinc-500 mb-3">{"// Onboard a contractor in one call"}</div>
          <pre>{`POST /v1/contractors
Authorization: Bearer spk_live_...

{
  "externalId": "nurse-jane-001",
  "email": "jane@example.com",
  "firstName": "Jane",
  "lastName": "Smith"
}`}</pre>
          <div className="mt-4 text-zinc-500">{"// → Wingspan account created. W-9 invite sent. Done."}</div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/40 py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">Three API calls to first payment</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", title: "Onboard", desc: "POST one contractor. They receive a branded W-9 + payout setup flow. Onboard once, pay forever." },
              { step: "02", title: "Create payable", desc: "When work happens, create a payable. Attach it to the right legal entity for correct EIN + 1099 filing." },
              { step: "03", title: "Disburse", desc: "One call sweeps all pending payables into a payroll batch. Contractors get paid instantly." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="bg-white rounded-xl p-6 border border-border">
                <div className="text-primary font-mono text-sm font-bold mb-3">{step}</div>
                <h3 className="font-semibold text-lg mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-24 px-6 max-w-4xl mx-auto text-center">
        <h2 className="text-3xl font-bold mb-4">Simple, transparent pricing</h2>
        <p className="text-muted-foreground mb-12">No hidden fees. Pay as you grow.</p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { plan: "Starter", price: "$149", fee: "0.8% per disbursement", note: "1 entity, 50 contractors" },
            { plan: "Growth", price: "$499", fee: "0.5% per disbursement", note: "10 entities, 500 contractors", highlight: true },
            { plan: "Enterprise", price: "Custom", fee: "Volume pricing", note: "Unlimited everything" },
          ].map(({ plan, price, fee, note, highlight }) => (
            <div key={plan} className={`rounded-xl p-6 border ${highlight ? "border-primary bg-primary/5" : "border-border"}`}>
              <div className="font-semibold text-sm text-muted-foreground mb-1">{plan}</div>
              <div className="text-3xl font-bold mb-1">{price}<span className="text-base font-normal text-muted-foreground">{price !== "Custom" ? "/mo" : ""}</span></div>
              <div className="text-sm text-muted-foreground mb-2">{fee}</div>
              <div className="text-xs text-muted-foreground">{note}</div>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Link href="/pricing" className="text-primary text-sm font-medium hover:underline">See full pricing →</Link>
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
