-- Mark all past steps (effective_date < today) as already adjusted
-- These are historical steps that have already taken effect
UPDATE rnt_staffelmiete_history
SET tenant_adjusted = true,
    adjusted_date   = effective_date
WHERE effective_date < CURRENT_DATE
  AND tenant_adjusted = false;

-- Verify: should only show future steps as unadjusted
SELECT
  a.name,
  s.effective_date,
  s.amount,
  s.tenant_adjusted
FROM rnt_staffelmiete_history s
JOIN rentals_apartments a ON a.id = s.apartment_id
ORDER BY a.name, s.effective_date;
