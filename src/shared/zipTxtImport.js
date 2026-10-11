/**
 * Small offline ZIP reader for WhatsApp TXT exports.
 * Supports classic ZIP, UTF-8 names, stored (0) and deflate (8) entries.
 * Deliberately rejects encrypted/ZIP64 entries instead of importing partial data.
 */
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_TEXT_FILES = 500;
const MAX_TEXT_FILE_BYTES = 25 * 1024 * 1024;

function u16(view, offset) { return view.getUint16(offset, true); }
function u32(view, offset) { return view.getUint32(offset, true); }

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('هذا المتصفح لا يدعم فك ضغط ZIP دون اتصال. افتح الملف TXT مباشرة أو حدّث Chrome.');
  }
  let stream;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  } catch (error) {
    throw new Error('صيغة الضغط داخل ZIP غير مدعومة في هذا المتصفح.');
  }
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipTxtFiles(file) {
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error('حجم ملف ZIP أكبر من الحد الآمن (100 ميجابايت). قسّم الأرشيف إلى ملفات أصغر.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minEocd = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEocd; i -= 1) {
    if (u32(view, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ملف ZIP غير صالح أو لا يحتوي على فهرس ZIP كامل.');
  if (u16(view, eocd + 4) !== 0 || u16(view, eocd + 6) !== 0) {
    throw new Error('ملفات ZIP متعددة الأقراص غير مدعومة.');
  }
  const count = u16(view, eocd + 10);
  const centralSize = u32(view, eocd + 12);
  const centralOffset = u32(view, eocd + 16);
  if (count === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new Error('أرشيف ZIP64 غير مدعوم؛ أعد ضغط ملفات TXT بصيغة ZIP عادية.');
  }
  if (centralOffset + centralSize > bytes.length) throw new Error('فهرس ZIP خارج حدود الملف.');

  const decoder = new TextDecoder('utf-8');
  const extracted = [];
  let offset = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > bytes.length || u32(view, offset) !== 0x02014b50) {
      throw new Error('تعذّر قراءة فهرس ZIP؛ الملف تالف أو غير مكتمل.');
    }
    const flags = u16(view, offset + 8);
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const uncompressedSize = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const nameStart = offset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    offset = nameStart + nameLength + extraLength + commentLength;

    if (name.endsWith('/') || !name.toLowerCase().endsWith('.txt')) continue;
    if (extracted.length >= MAX_TEXT_FILES) {
      throw new Error('الأرشيف يحتوي على أكثر من 500 ملف TXT؛ قسّمه إلى أرشيفات أصغر.');
    }
    if (flags & 1) throw new Error('الأرشيف محمي بكلمة مرور. صدّره دون تشفير ثم أعد المحاولة.');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('أحد ملفات الأرشيف يستخدم ZIP64 غير المدعوم.');
    }
    if (uncompressedSize > MAX_TEXT_FILE_BYTES) {
      throw new Error(`الملف ${name} أكبر من 25 ميجابايت.`);
    }
    if (localOffset + 30 > bytes.length || u32(view, localOffset) !== 0x04034b50) {
      throw new Error(`تعذّر قراءة الملف ${name} داخل ZIP.`);
    }
    const localNameLength = u16(view, localOffset + 26);
    const localExtraLength = u16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) throw new Error(`بيانات الملف ${name} غير مكتملة.`);
    const compressed = bytes.slice(dataStart, dataEnd);
    let plain;
    if (method === 0) plain = compressed;
    else if (method === 8) plain = await inflateRaw(compressed);
    else throw new Error(`طريقة الضغط في ${name} غير مدعومة.`);
    if (plain.byteLength !== uncompressedSize) {
      throw new Error(`حجم الملف ${name} بعد فك الضغط لا يطابق الفهرس.`);
    }
    extracted.push({ name, text: decoder.decode(plain) });
  }
  if (extracted.length === 0) throw new Error('لم أجد أي ملف TXT داخل ZIP.');
  return extracted;
}
