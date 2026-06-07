-- Optional: add GPS columns to responders for accurate map routing
-- Run in Supabase SQL Editor

ALTER TABLE responders ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8);
ALTER TABLE responders ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8);

-- Sample responders (Philippines area)
INSERT INTO responders (first_name, last_name, contact_number, responder_type, availability_status, latitude, longitude)
VALUES
  ('Emily', 'Dayton', '09171234567', '1st Responder', 'Available', 10.31570000, 123.88540000),
  ('Juan', 'Reyes', '09181234567', 'Ambulance', 'Available', 10.32000000, 123.89000000),
  ('Maria', 'Santos', '09191234567', 'Fire Rescue', 'Available', 10.31000000, 123.88000000)
;
