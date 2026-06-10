import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rekkymrwxbleflxlqcpt.supabase.co'
const supabaseAnonKey = 'sb_publishable_az5ar3IXEJZCCTFdGd9bbg_MVOy-XR8'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
