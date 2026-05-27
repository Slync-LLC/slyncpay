import { apiServerGet } from "@/lib/api-server";
import { SettingsForm } from "./form-client";

interface BrandingConfig {
  name?: string;
  url?: string;
  supportEmail?: string;
}

interface Tenant {
  id: string;
  name: string;
  email: string;
  plan: string;
  brandingConfig: BrandingConfig | null;
}

export default async function SettingsPage() {
  let tenant: Tenant | null = null;
  try {
    tenant = await apiServerGet<Tenant>("/v1/tenant");
  } catch {
    // form handles null state
  }

  return (
    <SettingsForm
      initial={{
        name: tenant?.brandingConfig?.name ?? tenant?.name ?? "",
        website: tenant?.brandingConfig?.url ?? "",
        supportEmail: tenant?.brandingConfig?.supportEmail ?? tenant?.email ?? "",
        plan: tenant?.plan ?? "starter",
      }}
    />
  );
}
