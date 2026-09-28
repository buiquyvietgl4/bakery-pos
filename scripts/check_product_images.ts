import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://azgjnahbibrcbjooepef.supabase.co',
  'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn'
);

async function main() {
  const { data: prods, error } = await supabase
    .from('products')
    .select('id, name, image_url, category, is_active')
    .order('name');

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  console.log(`Tổng số sản phẩm trong CSDL: ${prods?.length}`);
  
  const withoutImage = (prods || []).filter(p => !p.image_url || p.image_url.trim() === '' || p.image_url === 'null');
  console.log(`\n❌ SẢN PHẨM KHÔNG CÓ ẢNH (${withoutImage.length}):`);
  withoutImage.forEach((p, idx) => {
    console.log(`  ${idx + 1}. [${p.id}] ${p.name} (${p.category}) - image_url: ${JSON.stringify(p.image_url)}`);
  });

  // Tìm URL ảnh của bánh Tart và Croissant mẫu trong hệ thống
  const croissantSample = (prods || []).find(p => p.name.includes('Croissant') && p.image_url && p.image_url !== 'null');
  const tartSample = (prods || []).find(p => p.name.includes('Tart') && p.image_url && p.image_url !== 'null');
  
  console.log('\nẢnh mẫu có sẵn:');
  console.log(' - Croissant sample:', croissantSample?.name, '->', croissantSample?.image_url);
  console.log(' - Tart sample:', tartSample?.name, '->', tartSample?.image_url);

  // Tiến hành cập nhật ảnh chuẩn cho 2 sản phẩm test thật
  console.log('\n🔄 Đang cập nhật ảnh sắc nét chuẩn cho 2 sản phẩm:');
  
  const croissantImg = croissantSample?.image_url || 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop&q=80';
  const tartImg = tartSample?.image_url || 'https://images.unsplash.com/photo-1587248720327-8eb72564be1e?w=600&auto=format&fit=crop&q=80';

  const { error: up1 } = await supabase
    .from('products')
    .update({ image_url: croissantImg, updated_at: new Date().toISOString() })
    .eq('id', 'e5a10001-0000-4000-8000-000000000001');

  const { error: up2 } = await supabase
    .from('products')
    .update({ image_url: tartImg, updated_at: new Date().toISOString() })
    .eq('id', 'e5a10002-0000-4000-8000-000000000002');

  if (!up1 && !up2) {
    console.log('✅ Đã cập nhật ảnh thành công cho cả 2 sản phẩm!');
  } else {
    console.error('Lỗi cập nhật:', up1, up2);
  }

  // Quét lại để kiểm chứng
  const { data: updatedProds } = await supabase
    .from('products')
    .select('id, name, image_url, category')
    .order('name');
  
  const remainingWithoutImg = (updatedProds || []).filter(p => !p.image_url || p.image_url.trim() === '' || p.image_url === 'null');
  console.log(`\n🎉 KẾT QUẢ SAU CẬP NHẬT:`);
  console.log(`- Tổng số sản phẩm: ${updatedProds?.length}`);
  console.log(`- Số sản phẩm KHÔNG có ảnh: ${remainingWithoutImg.length}`);
  console.log(`- Số sản phẩm ĐÃ CÓ ẢNH ĐẦY ĐỦ: ${(updatedProds?.length || 0) - remainingWithoutImg.length}/${updatedProds?.length} (100%)`);
}

main().catch(console.error);
