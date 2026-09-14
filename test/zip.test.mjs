import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ Blob, TextEncoder, Uint8Array, DataView, console, globalThis: null });
ctx.globalThis = ctx;
vm.runInContext(readFileSync(new URL('../src/sidepanel/zip.js', import.meta.url), 'utf8'), ctx);

const z = new ctx.ZipWriter();
const enc = new TextEncoder();
z.add('001-photo.jpg', enc.encode('hello world, this is fake jpeg bytes'));
z.add('002-café ünïcode.jpg', enc.encode('second file payload'));
const dupe1 = z.add('dupe.jpg', enc.encode('a'));
const dupe2 = z.add('dupe.jpg', enc.encode('b'));
console.log('dedupe:', dupe1, '/', dupe2);

// CRC32 known-answer test: crc32("123456789") === 0xCBF43926
const kat = ctx.crc32(enc.encode('123456789'));
console.log('crc32 KAT:', kat.toString(16), kat === 0xcbf43926 ? 'PASS' : 'FAIL');

const blob = z.finish();
const buf = Buffer.from(await blob.arrayBuffer());
writeFileSync('/tmp/out.zip', buf);
console.log('zip bytes:', buf.length);
