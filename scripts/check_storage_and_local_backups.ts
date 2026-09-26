// scripts/check_storage_and_local_backups.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  console.log('=== CHECKING STORAGE AND LOCAL BACKUPS ===');

  // Check Supabase Storage
  const { data: storageFiles, error: storageErr } = await supabase.storage.from('bakery-images').list('cloud_backups_7days');
  if (storageErr) {
    console.error('Storage list error:', storageErr);
  } else {
    console.log(`Found ${storageFiles?.length || 0} backups in Supabase Storage bakery-images/cloud_backups_7days:`);
    storageFiles?.forEach((f) => {
      console.log(`  - ${f.name} (${Math.round((f.metadata?.size || 0) / 1024)} KB, created: ${f.created_at})`);
    });
  }

  // Check local SQL backup folders
  const localDirs = [
    path.join(process.cwd(), 'SQL backup', 'auto backup'),
    path.join(process.cwd(), 'SQL backup', 'tam thoi 7 ngay'),
    path.join(process.cwd(), 'SQL backup'),
  ];

  for (const dir of localDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      console.log(`\nLocal directory [${dir}]: ${files.length} files`);
      files.forEach((f) => {
        const stat = fs.statSync(path.join(dir, f));
        if (stat.isFile()) {
          console.log(`  - ${f} (${Math.round(stat.size / 1024)} KB)`);
        }
      });
    }
  }
}

check().catch(console.error);
