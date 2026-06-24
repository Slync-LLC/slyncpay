-- Business-contractor support: encrypted EIN for the Wingspan company block.
--
-- Other business fields (contractor type, legal business name, federal tax
-- classification / structure, business address, state/year of incorporation,
-- business phone) ride in the existing workers.w9_seeded_data JSONB — only the
-- EIN needs its own encrypted column, mirroring ssn_encrypted.

ALTER TABLE workers ADD COLUMN ein_encrypted text;
