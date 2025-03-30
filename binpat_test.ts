import { assertEquals } from '@std/assert';
import Binpat, {
  array,
  bool,
  convert,
  f16,
  f32,
  f64,
  i16,
  i32,
  i64,
  i8,
  omit,
  peek,
  seek,
  skip,
  spread,
  string,
  ternary,
  u16,
  u32,
  u64,
  u8,
} from 'binpat';

Deno.test('u8', () => {
  const { buffer } = new Uint8Array([1]);
  assertEquals(new Binpat(u8()).exec(buffer), 0x01);
});

Deno.test('u16', () => {
  const { buffer } = new Uint8Array([1, 2]);
  assertEquals(new Binpat(u16()).exec(buffer), 0x0102);
  assertEquals(new Binpat(u16(true)).exec(buffer), 0x0201);
});

Deno.test('u32', () => {
  const { buffer } = new Uint8Array([1, 2, 3, 4]);
  assertEquals(new Binpat(u32()).exec(buffer), 0x01020304);
  assertEquals(new Binpat(u32(true)).exec(buffer), 0x04030201);
});

Deno.test('u64', () => {
  const { buffer } = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  assertEquals(new Binpat(u64()).exec(buffer), 0x0102030405060708n);
  assertEquals(new Binpat(u64(true)).exec(buffer), 0x0807060504030201n);
});

Deno.test('i8', () => {
  const { buffer } = new Uint8Array([0xff]);
  assertEquals(new Binpat(i8()).exec(buffer), -1);
});

Deno.test('i16', () => {
  const { buffer } = new Uint8Array([0, 0xff]);
  assertEquals(new Binpat(i16()).exec(buffer), 0x00ff);
  assertEquals(new Binpat(i16(true)).exec(buffer), -0x0100);
});

Deno.test('i32', () => {
  const { buffer } = new Uint8Array([0, 0, 0, 0xff]);
  assertEquals(new Binpat(i32()).exec(buffer), 0x000000ff);
  assertEquals(new Binpat(i32(true)).exec(buffer), -0x01000000);
});

Deno.test('i64', () => {
  const { buffer } = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0xff]);
  assertEquals(new Binpat(i64()).exec(buffer), 0x00000000000000ffn);
  assertEquals(new Binpat(i64(true)).exec(buffer), -0x0100000000000000n);
});

Deno.test('f16', () => {
  const buffer = new ArrayBuffer(16);
  const view = new DataView(buffer);
  view.setFloat16(0, Math.PI);
  assertEquals(new Binpat(f16()).exec(buffer), view.getFloat16(0));
  view.setFloat16(0, Math.PI, true);
  assertEquals(new Binpat(f16(true)).exec(buffer), view.getFloat16(0, true));
});

Deno.test('f32', () => {
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  view.setFloat32(0, Math.PI);
  assertEquals(new Binpat(f32()).exec(buffer), view.getFloat32(0));
  view.setFloat32(0, Math.PI, true);
  assertEquals(new Binpat(f32(true)).exec(buffer), view.getFloat32(0, true));
});

Deno.test('f64', () => {
  const buffer = new ArrayBuffer(32);
  const view = new DataView(buffer);
  view.setFloat64(0, Math.PI);
  assertEquals(new Binpat(f64()).exec(buffer), view.getFloat64(0));
  view.setFloat64(0, Math.PI, true);
  assertEquals(new Binpat(f64(true)).exec(buffer), view.getFloat64(0, true));
});

Deno.test('bool', () => {
  assertEquals(new Binpat(bool()).exec(new Uint8Array([0]).buffer), false);
  assertEquals(new Binpat(bool()).exec(new Uint8Array([1]).buffer), true);
});

Deno.test('string', () => {
  const utf8 = Uint8Array.from(new TextEncoder().encode('binpat'));
  assertEquals(new Binpat(string(6)).exec(utf8.buffer), 'binpat');

  const gbk = new Uint8Array([214, 208, 206, 196]);
  assertEquals(new Binpat(string(4, 'gbk')).exec(gbk.buffer), '中文');

  const binpat = new Binpat({ size: u8(), text: string((ctx) => ctx.data.size) });
  assertEquals(binpat.exec(new Uint8Array([3, ...utf8]).buffer), { size: 3, text: 'bin' });
});

Deno.test('array', () => {
  const binpat1 = new Binpat(array(u8(), 4));
  assertEquals(
    binpat1.exec(new Uint8Array([0, 1, 2, 3]).buffer),
    new Uint8Array([0, 1, 2, 3]),
  );

  const binpat2 = new Binpat(array({ id: u16(), enabled: bool() }, 2));
  assertEquals(
    binpat2.exec(new Uint8Array([0, 1, 0, 0, 2, 1]).buffer),
    [{ id: 1, enabled: false }, { id: 2, enabled: true }],
  );

  const binpat3 = new Binpat({
    count: u8(),
    items: array(u8(), (ctx) => ctx.data.count),
  });
  assertEquals(
    binpat3.exec(new Uint8Array([3, 0, 1, 2, 3, 4]).buffer),
    { count: 3, items: new Uint8Array([0, 1, 2]) },
  );
  assertEquals(
    binpat3.exec(new Uint8Array([4, 0, 1, 2, 3, 4]).buffer),
    { count: 4, items: new Uint8Array([0, 1, 2, 3]) },
  );
});

Deno.test('ternary', () => {
  const binpat = new Binpat({
    flag: bool(),
    value: ternary((ctx) => ctx.data.flag, u8(), i8()),
  });
  assertEquals(binpat.exec(new Uint8Array([0, 0xff]).buffer), { flag: false, value: -1 });
  assertEquals(binpat.exec(new Uint8Array([1, 0xff]).buffer), { flag: true, value: 0xff });
});

Deno.test('convert', () => {
  const binpat = new Binpat({
    type: convert(u8(), (value) => ['', 'ico', 'cur'][value]),
  });
  assertEquals(binpat.exec(new Uint8Array([1]).buffer), { type: 'ico' });
  assertEquals(binpat.exec(new Uint8Array([2]).buffer), { type: 'cur' });
});

Deno.test('seek', () => {
  const binpat1 = new Binpat({
    [omit()]: seek(4),
    data: u8(),
  });
  assertEquals(binpat1.exec(new Uint8Array([0, 0, 0, 0, 1]).buffer), { data: 1 });

  const binpat2 = new Binpat({
    dataStart: u8(),
    [omit()]: seek((ctx) => ctx.data.dataStart),
    data: u8(),
  });
  assertEquals(binpat2.exec(new Uint8Array([4, 0, 0, 0, 1]).buffer), { dataStart: 4, data: 1 });
});

Deno.test('peek', () => {
  const binpat1 = new Binpat({
    foo: u8(),
    baz: peek(2, u8()),
    bar: u8(),
  });
  assertEquals(
    binpat1.exec(new Uint8Array([1, 2, 3]).buffer),
    { foo: 1, baz: 3, bar: 2 },
  );

  const binpat2 = new Binpat(array({
    id: u8(),
    offset: u8(),
    data: peek((ctx) => ctx.data.offset, u8()),
  }, 2));
  assertEquals(
    binpat2.exec(new Uint8Array([1, 4, 2, 5, 1, 2]).buffer),
    [{ id: 1, offset: 4, data: 1 }, { id: 2, offset: 5, data: 2 }],
  );
});

Deno.test('skip', () => {
  const binpat = new Binpat({
    [omit()]: skip(4),
    data: u8(),
  });
  assertEquals(binpat.exec(new Uint8Array([0, 0, 0, 0, 1]).buffer), { data: 1 });
});

Deno.test('omit', () => {
  const binpat = new Binpat({
    foo: u8(),
    [omit('bar')]: u8(),
    baz: u8(),
  });
  assertEquals(binpat.exec(new Uint8Array([1, 2, 3]).buffer), { foo: 1, baz: 3 });
});

Deno.test('spread', () => {
  const binpat = new Binpat({
    flag: bool(),
    [spread()]: ternary(
      (ctx) => ctx.data.flag,
      { truthy: u8() },
      { falsy: u8() },
    ),
  });
  assertEquals(binpat.exec(new Uint8Array([1, 1]).buffer), { flag: true, truthy: 1 });
  assertEquals(binpat.exec(new Uint8Array([0, 1]).buffer), { flag: false, falsy: 1 });
});

Deno.test('endianess', () => {
  const { buffer } = new Uint8Array([1, 2]);
  assertEquals(new Binpat(u16()).exec(buffer), 0x0102);
  assertEquals(new Binpat(u16(), { endian: 'big' }).exec(buffer), 0x0102);
  assertEquals(new Binpat(u16(), { endian: 'little' }).exec(buffer), 0x0201);
  assertEquals(new Binpat(u16(true)).exec(buffer), 0x0201);
  assertEquals(new Binpat(u16(true), { endian: 'big' }).exec(buffer), 0x0201);
});

Deno.test('data structure', () => {
  const binpat = new Binpat({
    rawNumber: 123,
    rawArray: [u8(), u8()],
    count: u8(),
    rawObject: {
      items: array(u8(), (ctx) => ctx.parent?.data.count),
    },
  });
  assertEquals(binpat.exec(new Uint8Array([1, 1, 3, 1, 2, 3]).buffer), {
    rawNumber: 123,
    rawArray: [1, 1],
    count: 3,
    rawObject: {
      items: new Uint8Array([1, 2, 3]),
    },
  });
});
