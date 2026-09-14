/* Minimal ZIP writer — store method only, no dependencies.
 *
 * JPEG/PNG/WebP are already compressed, so deflating them buys ~1% and costs
 * a lot of CPU. Storing them keeps this file small enough to audit and means
 * no remote library, which MV3's CSP would block anyway.
 *
 * Limits: ZIP32, so 4 GB total and 65,535 entries. Both are checked.
 */
(function (global) {
  'use strict';

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  const dosTime = (d) =>
    ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;

  const dosDate = (d) =>
    (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

  const MAX_SIZE = 0xffffffff;
  const MAX_ENTRIES = 0xffff;

  class ZipWriter {
    constructor() {
      this.parts = [];
      this.entries = [];
      this.offset = 0;
      this.names = new Set();
    }

    /** Ensure no two entries share a path — Windows Explorer silently drops
     *  duplicates, which looks exactly like "the extension missed photos". */
    uniqueName(name) {
      if (!this.names.has(name)) {
        this.names.add(name);
        return name;
      }
      const dot = name.lastIndexOf('.');
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let i = 2;
      let candidate;
      do {
        candidate = `${stem} (${i})${ext}`;
        i++;
      } while (this.names.has(candidate));
      this.names.add(candidate);
      return candidate;
    }

    add(name, data, date = new Date()) {
      if (this.entries.length >= MAX_ENTRIES) {
        throw new Error(
          `A ZIP can hold ${MAX_ENTRIES} files. Split the album or save as separate files.`
        );
      }

      const finalName = this.uniqueName(name);
      const nameBytes = new TextEncoder().encode(finalName);
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      const crc = crc32(bytes);
      const t = dosTime(date);
      const dt = dosDate(date);

      if (this.offset + bytes.length + nameBytes.length + 30 > MAX_SIZE) {
        throw new Error('ZIP would exceed 4 GB. Save as separate files instead.');
      }

      const header = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(header.buffer);
      dv.setUint32(0, 0x04034b50, true); // local file header signature
      dv.setUint16(4, 20, true); // version needed
      dv.setUint16(6, 0x0800, true); // flags: UTF-8 names
      dv.setUint16(8, 0, true); // method: store
      dv.setUint16(10, t, true);
      dv.setUint16(12, dt, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, bytes.length, true); // compressed size
      dv.setUint32(22, bytes.length, true); // uncompressed size
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true); // extra length
      header.set(nameBytes, 30);

      this.parts.push(header, bytes);
      this.entries.push({
        nameBytes,
        crc,
        size: bytes.length,
        offset: this.offset,
        t,
        dt,
      });
      this.offset += header.length + bytes.length;
      return finalName;
    }

    finish() {
      const central = [];
      let cdSize = 0;

      for (const e of this.entries) {
        const b = new Uint8Array(46 + e.nameBytes.length);
        const dv = new DataView(b.buffer);
        dv.setUint32(0, 0x02014b50, true); // central directory signature
        dv.setUint16(4, 20, true); // version made by
        dv.setUint16(6, 20, true); // version needed
        dv.setUint16(8, 0x0800, true); // flags: UTF-8
        dv.setUint16(10, 0, true); // method: store
        dv.setUint16(12, e.t, true);
        dv.setUint16(14, e.dt, true);
        dv.setUint32(16, e.crc, true);
        dv.setUint32(20, e.size, true);
        dv.setUint32(24, e.size, true);
        dv.setUint16(28, e.nameBytes.length, true);
        dv.setUint16(30, 0, true); // extra length
        dv.setUint16(32, 0, true); // comment length
        dv.setUint16(34, 0, true); // disk number
        dv.setUint16(36, 0, true); // internal attrs
        dv.setUint32(38, 0, true); // external attrs
        dv.setUint32(42, e.offset, true);
        b.set(e.nameBytes, 46);
        central.push(b);
        cdSize += b.length;
      }

      const eocd = new Uint8Array(22);
      const dv = new DataView(eocd.buffer);
      dv.setUint32(0, 0x06054b50, true); // end of central directory
      dv.setUint16(4, 0, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, this.entries.length, true);
      dv.setUint16(10, this.entries.length, true);
      dv.setUint32(12, cdSize, true);
      dv.setUint32(16, this.offset, true);
      dv.setUint16(20, 0, true); // comment length

      return new Blob([...this.parts, ...central, eocd], {
        type: 'application/zip',
      });
    }
  }

  global.ZipWriter = ZipWriter;
  global.crc32 = crc32;
})(typeof self !== 'undefined' ? self : globalThis);
