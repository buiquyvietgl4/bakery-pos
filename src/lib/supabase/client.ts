import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://azgjnahbibrcbjooepef.supabase.co';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';

export const supabase = createClient(supabaseUrl, supabaseKey);
