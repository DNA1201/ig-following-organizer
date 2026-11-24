/**
 * Zero-dependency ZIP reader for Instagram official export archives.
 * Uses browser native DecompressionStream('deflate-raw') — works 100% offline.
 */

export async function extractJsonFilesFromZip(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Locate End of Central Directory (EOCD) signature 0x06054b50
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('無法解析 ZIP 檔案：找不到中央目錄結尾標記。請確認這是完整的 Instagram 官方匯出檔。');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const decoder = new TextDecoder('utf-8');
  const results = [];
  let ptr = cdOffset;

  for (let i = 0; i < entryCount; i++) {
    if (ptr + 46 > bytes.length || view.getUint32(ptr, true) !== 0x02014b50) {
      break;
    }
    const compressionMethod = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    // Only extract relevant Instagram followers/following JSON files
    const lower = fileName.toLowerCase();
    if (!lower.endsWith('.json')) continue;
    if (!lower.includes('following') && !lower.includes('follower')) continue;

    // Read local file header to find exact data start
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);

    let text = '';
    if (compressionMethod === 0) {
      text = decoder.decode(compressedData);
    } else if (compressionMethod === 8) {
      text = await inflateRaw(compressedData);
    } else {
      continue;
    }

    results.push({ name: fileName, text });
  }

  return results;
}

async function inflateRaw(compressedBytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('目前瀏覽器不支援內建 ZIP 解壓縮，請先在電腦解壓縮後直接匯入 JSON 檔，或改用最新版 Chrome / Edge / Safari。');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(compressedBytes);
  writer.close();

  const response = new Response(ds.readable);
  return await response.text();
}
