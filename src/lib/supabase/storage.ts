import { supabase } from './client';

export const PRIMARY_BUCKET = 'bakery-images';
export const FALLBACK_BUCKET = 'product-images';

/**
 * Upload ảnh trực tiếp lên Supabase Storage bucket (Store 1 GB)
 * Thử bakery-images trước, nếu lỗi thử tiếp product-images
 */
export async function uploadToStorage(
  blob: Blob | File,
  folder: 'products' | 'preorders' | 'qrcodes' = 'products'
): Promise<{ url: string; isCloudStorage: boolean; error?: string }> {
  try {
    const isPng = blob.type.includes('png');
    const isWebp = blob.type.includes('webp');
    const ext = isPng ? 'png' : isWebp ? 'webp' : 'jpg';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filePath = `${folder}/${timestamp}_${random}.${ext}`;

    const buckets = [PRIMARY_BUCKET, FALLBACK_BUCKET];

    for (const bucket of buckets) {
      try {
        const { data, error } = await supabase.storage
          .from(bucket)
          .upload(filePath, blob, {
            contentType: blob.type || 'image/jpeg',
            upsert: true,
          });

        if (!error && data?.path) {
          const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(data.path);

          if (urlData?.publicUrl) {
            console.log(`[Storage] Upload thành công vào bucket ${bucket}:`, urlData.publicUrl);
            return { url: urlData.publicUrl, isCloudStorage: true };
          }
        }
      } catch (bErr) {
        console.warn(`Lỗi upload bucket ${bucket}:`, bErr);
      }
    }
  } catch (err: any) {
    console.warn('[Storage] Lỗi khi upload:', err);
    return { url: '', isCloudStorage: false, error: err?.message };
  }

  return { url: '', isCloudStorage: false };
}

/**
 * Quét danh sách file trong cả 2 bucket bakery-images & product-images
 */
export async function getStorageBucketStats(): Promise<{ totalBytes: number; fileCount: number; files: any[] }> {
  try {
    let totalBytes = 0;
    let fileCount = 0;
    const allFiles: any[] = [];
    const buckets = [PRIMARY_BUCKET, FALLBACK_BUCKET];

    for (const bucket of buckets) {
      const folders = ['', 'products', 'preorders', 'qrcodes'];
      for (const folder of folders) {
        try {
          const { data, error } = await supabase.storage
            .from(bucket)
            .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });

          if (!error && Array.isArray(data)) {
            for (const item of data) {
              if (!item.id && !item.metadata) continue;
              const size = item.metadata?.size || 0;
              totalBytes += size;
              fileCount++;
              allFiles.push({
                bucket,
                name: item.name,
                folder: folder || 'root',
                size,
                created_at: item.created_at,
              });
            }
          }
        } catch {}
      }
    }

    return { totalBytes, fileCount, files: allFiles };
  } catch (err) {
    console.warn('[Storage] Lỗi quét dung lượng bucket:', err);
    return { totalBytes: 0, fileCount: 0, files: [] };
  }
}
