-- v2 low-friction onboarding state on workers.
--
-- taxVerificationStatus mirrors Wingspan's Tax verification lane ("Verified"
-- means we can deep-link the contractor straight to the payout chooser).
-- wingspan_payer_id stores the payee-bucket payer so W-9 consent can be
-- re-recorded when the onboarding link is re-fetched. w9_consent_at stamps it.

ALTER TABLE workers ADD COLUMN tax_verification_status text;
ALTER TABLE workers ADD COLUMN wingspan_payer_id text;
ALTER TABLE workers ADD COLUMN w9_consent_at timestamp with time zone;
