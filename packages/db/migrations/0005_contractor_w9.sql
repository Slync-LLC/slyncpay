-- Encrypted SSN/ITIN for the W-9 seed pushed to Wingspan. NEVER returned
-- to tenants; the contractor's DTO exposes ssn_last4 only.
ALTER TABLE contractors ADD COLUMN ssn_encrypted text;
