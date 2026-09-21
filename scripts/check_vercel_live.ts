async function check() {
  const html = await fetch('https://bakery-pos-rho.vercel.app/pos/').then(r => r.text());
  const matches = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]);
  console.log('Found chunks on Vercel:', matches.length);
  let found = false;
  for (const src of matches) {
    const js = await fetch('https://bakery-pos-rho.vercel.app' + src).then(r => r.text());
    if (js.includes('Súng quét') || js.includes('Sửa vốn') || js.includes('sung quet')) {
      console.log('Chunk', src, 'CONTAINS Súng quét / Sửa vốn!');
      found = true;
    }
  }
  if (!found) {
    console.log('KHÔNG tìm thấy "Súng quét" hay "Sửa vốn" trong bất kỳ chunk nào trên Vercel!');
  }
}
check().catch(console.error);
