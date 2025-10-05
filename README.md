# Binpat

[![GitHub Action](https://img.shields.io/github/actions/workflow/status/weizhenye/binpat/ci.yml?logo=github)](https://github.com/weizhenye/binpat/actions)
[![Codecov](https://img.shields.io/codecov/c/gh/weizhenye/binpat?logo=codecov)](https://codecov.io/gh/weizhenye/binpat)
[![License](https://img.shields.io/npm/l/binpat)](https://github.com/weizhenye/binpat/blob/master/LICENSE)
[![File size](https://img.shields.io/bundlephobia/minzip/binpat)](https://bundlephobia.com/result?p=binpat)

Binpat simplifies parsing binary data in JavaScript by allowing you to define the data structure using declarative patterns.

- **Declarative**: Define what your data looks like, no more manual `DataView` operations and offsets.
- **Readable**: Patterns often closely resemble the desired output object structure.
- **_Almost_ Type Safe**: Built with TypeScript, providing inferred return types based on your patterns.
  - However for `omit()` and `spread()`, I'm failed to pass the type gymnastics, help is welcomed.

## Features

- Common types: `u8`...`u64`, `i8`...`i64`, `f16`...`f64`, `bool`, `string`, `bitfield` and `array(pattern, size)`.
- Conditional parsing with `ternary(condition, truthy, falsy)`.
- Transform parsed values using `convert(pattern, fn)`.
- Control parsing offset with `skip(offset)`, `seek(offset)` and `peek(offset, pattern)`.
- Modify output structure with `omit()` (exclude fields) and `spread()` (flatten fields).

## Installation

Install from [![NPM Version](https://img.shields.io/npm/v/binpat?logo=npm)](https://www.npmjs.com/package/binpat)

```bash
npm i binpat
```

Install from [![JSR](https://jsr.io/badges/@aho/binpat)](https://jsr.io/@aho/binpat)

```bash
deno add jsr:@aho/binpat
```

Import from CDN [![jsDelivr](https://img.shields.io/jsdelivr/npm/hm/binpat?logo=jsdelivr)](https://www.jsdelivr.com/package/npm/binpat) or
[![](https://img.shields.io/badge/unpkg-555?logo=unpkg)](https://unpkg.com/binpat/)

```js
import Binpat from 'https://cdn.jsdelivr.net/npm/binpat/dist/binpat.js';
import Binpat from 'https://unpkg.com/binpat/dist/binpat.js';
```

## Usage

```js
import Binpat, { u8, u16, string, array } from 'binpat';

const filePattern = {
  fileType: string(4),  // e.g., 'DATA'
  version: u8(),        // e.g., 1
  numRecords: u16(),    // e.g., 2 records
  // Read 'numRecords' count of { id: u8, value: u8 }
  records: array({ id: u8(), value: u8() }, (ctx) => ctx.data.numRecords)
};

const binpat = new Binpat(filePattern);

const sampleData = new Uint8Array([
  0x44, 0x41, 0x54, 0x41, // 'DATA'
  0x01,                   // version 1
  0x00, 0x02,             // numRecords 2 (Big Endian)
  0x01, 0x64,             // Record 1: id=1, value=100
  0x02, 0xC8              // Record 2: id=2, value=200
]);

const result = binpat.exec(sampleData.buffer);

console.log(result);
/*
{
  fileType: 'DATA',
  version: 1,
  numRecords: 2,
  records: [
    { id: 1, value: 100 },
    { id: 2, value: 200 },
  ],
}
*/
```

Find more complex examples in the [examples](./examples/) directory.

## API

Find the full API details in the [docs](https://jsr.io/@aho/binpat/doc).

### new Binpat(pattern[, option])

`pattern` can be native object, native array or binpat functions.

```js
new Binpat({ foo: u8() });
new Binpat([u8(), u8()]);
new Binpat(array(u8(), 10));
```

`option` can set the global endianness:

```js
{
  // The global endianness.
  // 'big' | 'little'
  endian: 'big', // default
}
```

### u8, u16, u32, u64, i8, i16, i32, i64, f16, f32, f64

All these functions except `u8` and `i8` accept a boolean param to set endian. They will use the global endianness by default.

```js
import Binpat, { u8, u16 } from 'binpat';

const binpat = new Binpat({
  a: u8(),
  b: u16(),
  // use little endian
  c: u16(true),
});
```

### bool()

```js
import Binpat, { bool } from 'binpat';

const binpat = new Binpat({
  flag: bool(),
});
```

### string(size[, encoding])

You can parse binary to string with a specific [text encoding](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding):

```js
const utf8 = Uint8Array.from(new TextEncoder().encode('binpat'));
console.log(new Binpat(string(6)).exec(utf8.buffer));
// 'binpat'

const gbk = new Uint8Array([214, 208, 206, 196]);
console.log(new Binpat(string(4, 'gbk')).exec(gbk.buffer));
// '中文'
```

And the string size can be read from context dynamicly:

```js
new Binpat({
  size: u8(),
  text: string((ctx) => ctx.data.size),
});
```

### bitfield(layout[, option])

Define `layout` with native object:

```js
import Binpat, { bitfield, omit } from 'binpat';

const binpat = new Binpat(bitfield({
  a: 3, // unsigned, 3 bits
  b: bitfield.u(3), // unsigned, 3 bits
  [omit('padding')]: 4, // padding, 4 bits
  c: bitfield.i(5), // signed, 5 bits
  d: bitfield.bool(), // boolean, 1 bit
}));
//                                   aaabbbpp    ppcccccd
const { buffer } = new Uint8Array([0b01010101, 0b11001100]);
console.log(binpat.exec(buffer));
// {
//   a: 2,     // 0b010
//   b: 5,     // 0b101
//             // 0b0111 (padding)
//   c: 6,     // 0b00110
//   d: false, // 0b0
// }
```

`option` can set endian and [Bit numbering](https://en.wikipedia.org/wiki/Bit_numbering):

```js
{
  // The endianness of the bitfield.
  // Allow values: 'big' | 'little'
  // If not specified, it will use the global endianness.
  endian: 'big',
  // Which bit comes first, allow values:
  // + 'MSb': Most Significant Bit (left-to-right).
  // + 'LSb': Least Significant Bit (right-to-left).
  // If not specified:
  // + When endian is 'big', the first bit is 'MSb'.
  // + When endian is 'little', the first bit is 'LSb'.
  first: 'MSb',
}
```

### array(pattern, size)

`pattern` can be native object or binpat functions.

If the pattern is a primitive type, it will return a TypedArray instance.

```js
import Binpat, { array, u16, u8 } from 'binpat';

const binpat = new Binpat({
  // pattern can be object
  bar: array({ x: u8(), y: u8() }, 4),
  // It will return Uint16Array
  foo: array(u16(), 4),
});
```

And the array size can be read from context dynamicly:

```js
new Binpat({
  count: u32(),
  items: array(u8(), (ctx) => ctx.data.count),
});
```

### ternary(condition, truthy[, falsy])

It works like `condition ? truthy : falsy`

```js
import Binpat, { ternary, bool, u16, u8 } from 'binpat';

const binpat = new Binpat({
  flag: bool(),
  value: ternary(
    (ctx) => ctx.data.flag,
    [u8(), u8()],
    [u16()],
  ),
});
console.log(binpat.exec(new Uint8Array([1, 0, 0]).buffer));
// { flag: true, value: [0, 0] }
console.log(binpat.exec(new Uint8Array([0, 0, 0]).buffer));
// { flag: false, value: [0] }
```

### convert(pattern, fn)

Convert the result value with custom function:

```js
import Binpat, { convert, u16 } from 'binpat';

const binpat = new Binpat({
  type: convert(u16(), (value) => ['', 'ico', 'cur'][value] || 'unknown'),
});
console.log(binpat.exec(new Uint8Array([0, 1]).buffer));
// { type: 'ico' }
console.log(binpat.exec(new Uint8Array([0, 2]).buffer));
// { type: 'cur' }
console.log(binpat.exec(new Uint8Array([0, 0]).buffer));
// { type: 'unknown' }
```

### seek(offset)

Move current offset to the given offset.

`offset` can be number or a function returns a number.

```js
import Binpat, { seek, omit, u8 } from 'binpat';

const binpat = new Binpat({
  foo: u8(),
  [omit('padding')]: seek((ctx) => ctx.offset + 4),
  bar: u8(),
});
const { buffer } = new Uint8Array([1, 0, 0, 0, 0, 2]);
console.log(binpat.exec(buffer));
// { foo: 1, bar: 2 }
```

### peek(offset, pattern)

Reads pattern from the given offset, and doesn't move current offset.

`offset` can be number or a function returns a number.

```js
import Binpat, { array, peek, u8 } from 'binpat';

const binpat = new Binpat(array({
  size: u32(),
  address: u32(),
  data: peek(
    (ctx) => ctx.data.address,
    array(u8(), (ctx) => ctx.data.size),
  ),
}, 4));
```

### skip(offset)

Move forward with the given offset.

`skip(x)` is same as `seek((ctx) => ctx.offset + x)`

```js
import Binpat, { skip, omit, u8 } from 'binpat';

const binpat = new Binpat({
  foo: u8(),
  [omit('padding')]: skip(4),
  bar: u8(),
});
const { buffer } = new Uint8Array([1, 0, 0, 0, 0, 2]);
console.log(binpat.exec(buffer));
// { foo: 1, bar: 2 }
```

### omit(comment)

Omit the key-value in result.

`comment` can be any value.

```js
import Binpat, { omit, u16 } from 'binpat';

const binpat = new Binpat({
  [omit('reserved')]: u16(),
  type: u16(),
  count: u16(),
});
const { buffer } = new Uint8Array([0, 0, 0, 1, 0, 1]);
console.log(binpat.exec(buffer));
// { type: 1, count: 1 }
```

### spread()

It works like spread syntax `...`, and usually be used with `ternary()`.

```js
import Binpat, { spread, ternary, bool, u8 } from 'binpat';

const binpat = new Binpat({
  flag: bool(),
  [spread()]: ternary(
    (ctx) => ctx.data.flag,
    { truthy: u8() },
    { falsy: u8() },
  ),
});
console.log(binpat.exec(new Uint8Array([1, 0]).buffer));
// { flag: true, truthy: 0 }
console.log(binpat.exec(new Uint8Array([0, 0]).buffer));
// { flag: false, falsy: 0 }
```
