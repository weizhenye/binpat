// deno run --allow-read ./examples/ico.ts ./examples/favicon.ico

import type { BinpatContext } from '../binpat.ts';
import Binpat, { array, convert, omit, peek, spread, ternary, u16, u32, u8 } from '../binpat.ts';

// https://www.daubnet.com/en/file-format-ico
const ico = new Binpat({
  header: {
    [omit('reserved')]: u16(),
    type: convert(u16(), (value) => ['', 'ico', 'cur'][value]),
    count: u16(),
  },
  images: array({
    width: u8(),
    height: u8(),
    colorCount: u8(),
    reserved: u8(),
    [spread()]: ternary(
      (ctx) => (ctx.parent as BinpatContext).data.header.type === 'ico',
      {
        planes: u16(),
        bitsPerPixel: u16(),
      },
      {
        xHotspot: u16(),
        yHotspot: u16(),
      },
    ),
    size: u32(),
    offset: u32(),
    data: peek(
      (ctx) => ctx.data.offset,
      array(u8(), (ctx) => ctx.data.size),
    ),
  }, (ctx) => ctx.data.header.count),
}, { endian: 'little' });

const { buffer } = await Deno.readFile(Deno.args[0]);

const result = ico.exec(buffer);
console.log(result);
