import Link from "next/link";
import { Check, Minus } from "lucide-react";

const PLANS = [
  {
    name: "Starter",
    price: "$149",
    billing: "/mo",
    description: "Perfect for teams getting started with contractor payments.",
    disbursementFee: "0.8% + $0.25/tx",
    highlight: false,
    cta: "Start for free",
    ctaHref: "/sign-up",
    features: {
      entities: "1 entity / EIN",
      contractors: "50 active contractors",
      apiKeys: "2 API keys",
      webhooks: "1 webhook endpoint",
      teamMembers: "1 team member",
      branding: false,
      sso: false,
      support: "Email (2-day SLA)",
      "1099": true,
      customPricing: false,
    },
  },
  {
    name: "Growth",
    price: "$499",
    billing: "/mo",
    description: "For scaling teams with multiple entities and high volume.",
    disbursementFee: "0.5% + $0.15/tx",
    highlight: true,
    cta: "Start for free",
    ctaHref: "/sign-up?plan=growth",
    features: {
      entities: "10 entities / EINs",
      contractors: "500 active contractors",
      apiKeys: "10 API keys",
      webhooks: "5 webhook endpoints",
      teamMembers: "5 team members",
      branding: true,
      sso: false,
      support: "Chat + email",
      "1099": true,
      customPricing: false,
    },
  },
  {
    name: "Enterprise",
    price: "Custom",
    billing: "",
    description: "For large-scale operations and white-label deployments.",
    disbursementFee: "Volume pricing",
    highlight: false,
    cta: "Talk to sales",
    ctaHref: "mailto:sales@slyncpay.com",
    features: {
      entities: "Unlimited entities",
      contractors: "Unlimited contractors",
      apiKeys: "Unlimited API keys",
      webhooks: "Unlimited endpoints",
      teamMembers: "Unlimited members",
      branding: true,
      sso: true,
      support: "Dedicated Slack + named SE",
      "1099": true,
      customPricing: true,
    },
  },
];

const FEATURE_ROWS = [
  { key: "entities", label: "Entities / EINs" },
  { key: "contractors", label: "Active contractors" },
  { key: "disbursementFee", label: "Disbursement fee", isTop: true },
  { key: "apiKeys", label: "API keys" },
  { key: "webhooks", label: "Webhook endpoints" },
  { key: "teamMembers", label: "Team members" },
  { key: "branding", label: "Custom branding" },
  { key: "sso", label: "SSO / SAML" },
  { key: "1099", label: "1099-NEC filing" },
  { key: "support", label: "Support" },
];

function FeatureValue({ value }: { value: string | boolean | undefined }) {
  if (value === true) return <Check className="h-4 w-4 text-green-600 mx-auto" />;
  if (value === false) return <Minus className="h-4 w-4 text-muted-foreground/40 mx-auto" />;
  return <span className="text-sm">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-border px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="font-bold text-xl tracking-tight">SlyncPay</Link>
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/how-it-works" className="hover:text-foreground transition-colors">How it works</Link>
          <Link href="/sign-in" className="hover:text-foreground transition-colors">Sign in</Link>
          <Link href="/sign-up" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Simple, transparent pricing</h1>
        <p className="text-xl text-muted-foreground">
          No hidden fees. No per-seat charges. Pay a flat monthly fee plus a small percentage on what you disburse.
        </p>
      </section>

      {/* Pricing cards */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl p-6 border ${
                plan.highlight
                  ? "border-primary bg-primary/5 shadow-md"
                  : "border-border"
              }`}
            >
              {plan.highlight && (
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground mb-3">
                  Most popular
                </div>
              )}
              <div className="font-semibold text-muted-foreground mb-1">{plan.name}</div>
              <div className="text-4xl font-bold mb-0.5">
                {plan.price}
                {plan.billing && <span className="text-base font-normal text-muted-foreground">{plan.billing}</span>}
              </div>
              <div className="text-sm text-primary font-medium mb-3">{plan.disbursementFee}</div>
              <p className="text-sm text-muted-foreground mb-5">{plan.description}</p>
              <Link
                href={plan.ctaHref}
                className={`block text-center py-2.5 rounded-md text-sm font-medium transition-opacity ${
                  plan.highlight
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "border border-border hover:bg-muted"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Feature comparison */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-center mb-8">Full feature comparison</h2>
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground w-1/3">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.name} className={`px-6 py-4 text-sm font-semibold text-center ${p.highlight ? "text-primary" : ""}`}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {FEATURE_ROWS.map(({ key, label }) => (
                  <tr key={key} className="hover:bg-muted/20">
                    <td className="px-6 py-3.5 text-sm text-muted-foreground">{label}</td>
                    {PLANS.map((plan) => (
                      <td key={plan.name} className="px-6 py-3.5 text-center">
                        <FeatureValue value={key === "disbursementFee" ? plan.disbursementFee : (plan.features as Record<string, string | boolean>)[key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently asked questions</h2>
          <div className="space-y-5">
            {[
              {
                q: "What counts as an active contractor?",
                a: "An active contractor is any contractor in the onboarded state — W-9 completed and payout method set up. Invited but incomplete contractors don't count toward your limit.",
              },
              {
                q: "How is the disbursement fee calculated?",
                a: "The fee is applied per disbursement batch, not per contractor. If you disburse to 50 contractors in one batch, you pay one fee on the total batch amount.",
              },
              {
                q: "Do you charge for 1099 filing?",
                a: "No — 1099-NEC e-filing is included on all plans. We file automatically at year-end for all eligible contractors (earning $600+).",
              },
              {
                q: "Can I change plans?",
                a: "Yes, anytime. Upgrades take effect immediately. Plan changes are prospective — existing payable fees are not retroactively adjusted.",
              },
              {
                q: "Is there a free trial?",
                a: "Yes — all new accounts get a 14-day trial with full Starter-plan access. No credit card required to start.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-border pb-5">
                <h3 className="font-medium mb-2">{q}</h3>
                <p className="text-sm text-muted-foreground">{a}</p>
              </div>
            ))}
          </div>
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
