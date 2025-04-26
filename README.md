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

- Common types: `u8`...`u64`, `i8`...`i64`, `f16`...`f64`, `bool`, `string` and `array(pattern, size)`.
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

const binpat = new Binpat(filePattern, { endian: 'big' });

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

Find the full API details in the [docs](https://jsr.io/@aho/binpat/doc) and more complex examples in the [examples](./examples/) directory.
