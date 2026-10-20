const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('.next')) {
        results = results.concat(walk(file));
      }
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
const keys = new Set();
const keyRegex = /localStorage\.(?:getItem|setItem|removeItem)\(\s*['"`]([^'"`]+)['"`]/g;

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = keyRegex.exec(content)) !== null) {
    keys.add(m[1]);
  }
});

console.log('Total localStorage keys found in src:', keys.size);
const sortedKeys = Array.from(keys).sort();
console.log(JSON.stringify(sortedKeys, null, 2));

// Compare with BAKERY_DATA_KEYS in sqlModeManager.ts
const sqlModeContent = fs.readFileSync('./src/lib/utils/sqlModeManager.ts', 'utf8');
const match = sqlModeContent.match(/export const BAKERY_DATA_KEYS = \[([\s\S]*?)\];/);
let bakeryDataKeys = [];
if (match) {
  bakeryDataKeys = match[1]
    .split('\n')
    .map(l => l.trim().replace(/[',]/g, ''))
    .filter(l => l.length > 0 && !l.startsWith('//'));
}
console.log('\nTotal BAKERY_DATA_KEYS:', bakeryDataKeys.length);

const missingInBakeryDataKeys = sortedKeys.filter(k => 
  !bakeryDataKeys.includes(k) &&
  !k.startsWith('bakery_vault_') &&
  !k.startsWith('bakery_snapshot_') &&
  k !== 'bakery_sql_mode_config' &&
  k !== 'bakery_database_profiles' &&
  k !== 'bakery_active_database_profile_id' &&
  k !== 'bakery_ui_active_tab' &&
  k !== 'supabase.auth.token' &&
  !k.includes('debug')
);

console.log('\nKeys in localStorage but NOT in BAKERY_DATA_KEYS (to review):');
console.log(JSON.stringify(missingInBakeryDataKeys, null, 2));
