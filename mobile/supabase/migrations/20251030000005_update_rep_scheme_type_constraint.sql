-- Drop the old constraint
ALTER TABLE wods DROP CONSTRAINT IF EXISTS wods_rep_scheme_type_check;

-- Add updated constraint with For Load rep scheme types
ALTER TABLE wods ADD CONSTRAINT wods_rep_scheme_type_check
CHECK (
  rep_scheme_type IN (
    'descending',
    'fixed_rounds',
    'chipper',
    'ascending',
    'distance',
    'custom',
    '1rm',
    '3rm',
    '5rm',
    '10rm',
    '5x5',
    '3x3',
    'descending_volume',
    'complex'
  )
);
