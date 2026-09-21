import * as fs from 'fs';

const files = [
  'SQL backup/auto backup/latest_backup.bakery.json',
  'SQL backup/latest_backup.bakery.json',
  'public/backup/latest_backup.bakery.json'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      console.log(`\n=== FILE: ${file} ===`);
      console.log('bakery_current_shift:', parsed.bakery_current_shift);
      console.log('bakery_shift_history count:', parsed.bakery_shift_history?.length);
      if (parsed.bakery_shift_history?.length > 0) {
        console.log('First shift in history:', parsed.bakery_shift_history[0]);
      }
      // Check if 1600000 or similar exists anywhere in file
      if (raw.includes('1600000') || raw.includes('1.600') || raw.includes('1650') || raw.includes('1620')) {
        console.log('FOUND 1.6m in file!');
      }
    } catch (e: any) {
      console.error(`Error reading ${file}:`, e.message);
    }
  }
}
