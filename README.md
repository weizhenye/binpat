# binpat

[![GitHub Action](https://img.shields.io/github/actions/workflow/status/weizhenye/binpat/ci.yml?logo=github)](https://github.com/weizhenye/binpat/actions)
[![Codecov](https://img.shields.io/codecov/c/gh/weizhenye/binpat?logo=codecov)](https://codecov.io/gh/weizhenye/binpat)
[![License](https://img.shields.io/npm/l/binpat)](https://github.com/weizhenye/binpat/blob/master/LICENSE)
[![File size](https://img.shields.io/bundlephobia/minzip/binpat)](https://bundlephobia.com/result?p=binpat)

A simple binary data pattern matcher.

## Installation

[![NPM Version](https://img.shields.io/npm/v/binpat?logo=npm)](https://www.npmjs.com/package/binpat)
[![JSR](https://jsr.io/badges/@aho/binpat)](https://jsr.io/@aho/binpat)
[![jsDelivr](https://img.shields.io/jsdelivr/npm/hm/binpat?logo=jsdelivr)](https://www.jsdelivr.com/package/npm/binpat)
[![](https://img.shields.io/badge/unpkg-555?logo=unpkg)](https://unpkg.com/binpat/)

```bash
npm i binpat
```

## Usage

```js
import Binpat, { array, string, u32, u8 } from 'binpat';

const binpat = new Binpat({
  signature: string(8),
  width: u32(),
  height: u32(),
  imageData: array(u8(), (ctx) => ctx.data.width * ctx.data.height * 4),
});

const { buffer } = new Uint8Array([]);
binpat.exec(buffer);
```

Find more in [examples](./examples/).
