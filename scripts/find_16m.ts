import * as fs from 'fs';

const raw = fs.readFileSync('SQL backup/auto backup/latest_backup.bakery.json', 'utf8');
const parsed = JSON.parse(raw);

console.log('=== CURRENT_SHIFT IN BACKUP ===');
console.log(parsed.current_shift);

console.log('=== SHIFTS IN BACKUP ===');
console.log(parsed.shifts);

// Find any number > 1500000 and < 1700000 in raw
const matches = raw.match(/1[56]\d{5}/g);
console.log('Matches between 1.5m and 1.7m:', matches);
