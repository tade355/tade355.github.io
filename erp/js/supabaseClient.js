import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.3';

// This is the "anon" public key — it's meant to be embedded in client-side
// code like this. It only works within the RLS policies defined in
// erp/supabase/schema.sql, which right now (matching the app's existing
// soft, UI-only access model) allow full read/write to anyone who has it.
const SUPABASE_URL = 'https://ydjutniskysecomvgrwi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkanV0bmlza3lzZWNvbXZncndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NDc4MjUsImV4cCI6MjA5OTUyMzgyNX0.xT4IaPxWaMJb_-apv7zXnx7F_TJcnCbICk6D3NiSc8Q';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
