export interface BinpatOption {
  /** The global endianness. Defalut value is `big`. */
  endian: 'big' | 'little';
}

export type BinpatPattern = any;

export interface BinpatContext {
  endian: BinpatOption['endian'];
  parent?: BinpatContext;
  offset: number;
  data: any;
}

const BINPAT_TYPE = Symbol('type');
const BINPAT_ARRAY = Symbol('array');

function exec(dv: DataView, pattern: BinpatPattern, parent: BinpatContext): any {
  if (pattern[BINPAT_TYPE]) {
    return pattern(dv, parent);
  }
  if (Array.isArray(pattern)) {
    return pattern.map((pat) => exec(dv, pat, parent));
  }
  if (typeof pattern === 'object') {
    const ctx: BinpatContext = { ...parent, parent, data: {} };
    Object.entries(pattern).forEach(([key, value]) => {
      const result = exec(dv, value, ctx);
      if (key.startsWith('__BINPAT_SPREAD_')) {
        ctx.data = { ...ctx.data, ...result };
        return;
      }
      if (key.startsWith('__BINPAT_OMIT_')) {
        return;
      }
      ctx.data[key] = result;
    });
    parent.offset = ctx.offset;
    return ctx.data;
  }
  return pattern;
}

export default class Binpat {
  #pattern;
  endian: BinpatOption['endian'] = 'big';

  constructor(pattern: BinpatPattern, option?: BinpatOption) {
    this.#pattern = pattern;
    this.endian = option?.endian === 'little' ? 'little' : 'big';
  }

  exec(buffer: ArrayBuffer) {
    const ctx: BinpatContext = { endian: this.endian, offset: 0, data: {} };
    const dv = new DataView(buffer);
    return exec(dv, this.#pattern, ctx);
  }
}

type DataViewGetter = {
  [K in keyof DataView]: DataView[K] extends
    (byteOffset: number, littleEndian?: boolean) => number | bigint ? K : never;
}[keyof DataView];

type TypedArrayConstructor =
  | Uint8ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | BigUint64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | BigInt64ArrayConstructor
  | Float16ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

type BinpatTypeLe<T> = (
  /** Indicates whether the data is stored in little- or big-endian format. If `undefined`, the global endianness is used. */
  littleEndian?: boolean,
) => {
  (dv: DataView, ctx: BinpatContext): T;
  [BINPAT_TYPE]: string;
  [BINPAT_ARRAY]: TypedArrayConstructor;
};

function genType(
  name: string,
  bits: 8,
  method: DataViewGetter,
  array: TypedArrayConstructor,
): () => {
  (dv: DataView, ctx: BinpatContext): number;
  [BINPAT_TYPE]: string;
  [BINPAT_ARRAY]: TypedArrayConstructor;
};
function genType(
  name: string,
  bits: 64,
  method: DataViewGetter,
  array: TypedArrayConstructor,
): BinpatTypeLe<bigint>;
function genType(
  name: string,
  bits: number,
  method: DataViewGetter,
  array: TypedArrayConstructor,
): BinpatTypeLe<number>;
function genType(
  name: string,
  bits: number,
  method: DataViewGetter,
  array: TypedArrayConstructor,
) {
  function type(littleEndian?: boolean) {
    function handler(dv: DataView, ctx: BinpatContext) {
      const le = littleEndian ?? ctx.endian === 'little';
      const value = dv[method](ctx.offset, le);
      ctx.offset += bits / 8;
      return value;
    }
    handler[BINPAT_TYPE] = name + bits;
    handler[BINPAT_ARRAY] = array;
    return handler;
  }
  return type;
}

/**
 * Reads 1 byte and interprets it as an 8-bit unsigned integer.
 */
export const u8 = genType('u', 8, 'getUint8', Uint8Array);
/**
 * Reads 2 bytes and interprets them as a 16-bit unsigned integer.
 */
export const u16 = genType('u', 16, 'getUint16', Uint16Array);
/**
 * Reads 4 bytes and interprets them as a 32-bit unsigned integer.
 */
export const u32 = genType('u', 32, 'getUint32', Uint32Array);
/**
 * Reads 8 bytes and interprets them as a 64-bit unsigned integer.
 */
export const u64 = genType('u', 64, 'getBigUint64', BigUint64Array);

/**
 * Reads 1 byte and interprets it as an 8-bit signed integer.
 */
export const i8 = genType('i', 8, 'getInt8', Int8Array);
/**
 * Reads 2 bytes and interprets them as a 16-bit signed integer.
 */
export const i16 = genType('i', 16, 'getInt16', Int16Array);
/**
 * Reads 4 bytes and interprets them as a 32-bit signed integer.
 */
export const i32 = genType('i', 32, 'getInt32', Int32Array);
/**
 * Reads 8 bytes and interprets them as a 64-bit signed integer.
 */
export const i64 = genType('i', 64, 'getBigInt64', BigInt64Array);

/**
 * Reads 2 bytes and interprets them as a 16-bit floating point number.
 */
export const f16 = genType('f', 16, 'getFloat16', Float16Array);
/**
 * Reads 4 bytes and interprets them as a 32-bit floating point number.
 */
export const f32 = genType('f', 32, 'getFloat32', Float32Array);
/**
 * Reads 8 bytes and interprets them as a 64-bit floating point number.
 */
export const f64 = genType('f', 64, 'getFloat64', Float64Array);

/**
 * Reads 1 byte and and interprets it as a boolean value.
 */
export function bool() {
  function handler(dv: DataView, ctx: BinpatContext) {
    const value = !!dv.getUint8(ctx.offset);
    ctx.offset += 1;
    return value;
  }
  handler[BINPAT_TYPE] = 'bool';
  return handler;
}

/**
 * Reads the given number of bytes and decodes to a string.
 * @param size number of bytes
 * @param encoding same as [TextDecoder.encoding](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder/encoding)
 *
 * @example Usage
 * ```js
 * import Binpat, { string } from 'binpat';
 *
 * const binpat = new Binpat({ name: string(6) });
 * const { buffer } = new Uint8Array([98, 105, 110, 112, 97, 116]);
 * console.log(binpat.exec(buffer));
 * // { name: 'binpat' }
 * ```
 */
export function string(
  size: number | ((ctx: BinpatContext) => number),
  encoding: TextDecoderCommon['encoding'] = 'utf-8',
) {
  function handler(dv: DataView, ctx: BinpatContext) {
    const len = typeof size === 'function' ? size(ctx) : size;
    const value = new Uint8Array(dv.buffer.slice(ctx.offset, ctx.offset + len));
    ctx.offset += len;
    return new TextDecoder(encoding).decode(value);
  }
  handler[BINPAT_TYPE] = 'string';
  return handler;
}

/**
 * Reads multiple values of the same pattern.
 * @param pattern
 * @param size
 *
 * @example Usage
 * ```
 * import Binpat, { array, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   // It will return Uint16Array
 *   foo: array(u16(), 4),
 *   // pattern can be object
 *   bar: array({ x: u8(), y: u8() }, 4),
 *   count: u32(),
 *   // get size from context
 *   baz: array(u8(), (ctx) => ctx.data.count),
 * });
 * ```
 */
export function array(pattern: BinpatPattern, size: number | ((ctx: BinpatContext) => number)) {
  function handler(dv: DataView, ctx: BinpatContext) {
    const len = typeof size === 'function' ? size(ctx) : size;
    return (pattern[BINPAT_ARRAY] || Array).from({ length: len })
      .map(() => exec(dv, pattern, ctx));
  }
  handler[BINPAT_TYPE] = 'array';
  return handler;
}

// export function bitfield(field: { [name: string]: number }) {
//   function handler(dv: DataView, ctx: BinpatContext) {
//   }
//   handler[BINPAT_TYPE] = 'bitfield';
//   return handler;
// }

/**
 * It works like `condition(ctx) ? truthy : falsy`
 * @param condition
 * @param truthy
 * @param falsy
 *
 * @example Usage
 * ```js
 * import Binpat, { ternary, bool, u16, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   flag: bool(),
 *   value: ternary((ctx) => ctx.data.flag, [u8(), u8(), u8(), u8()], [u16(), u16]),
 * });
 * console.log(binpat.exec(buffer));
 * // { flag: true, value: [0, 0, 0, 0] }
 * // or
 * // { flag: false, value: [0, 0] }
 * ```
 */
export function ternary(
  condition: (ctx: BinpatContext) => boolean,
  truthy: BinpatPattern,
  falsy?: BinpatPattern,
) {
  function handler(dv: DataView, ctx: BinpatContext) {
    const pattern = condition(ctx) ? truthy : falsy;
    return exec(dv, pattern, ctx);
  }
  handler[BINPAT_TYPE] = 'ternary';
  return handler;
}

/**
 * Convert the result value with custom function.
 * @param pattern
 * @param fn
 *
 * @example Usage
 * ```js
 * import Binpat, { convert } from 'binpat';
 *
 * const binpat = new Binpat({
 *   type: convert(u16(), (value) => ['', 'ico', 'cur'][value] || 'unknown'),
 * });
 * console.log(binpat.exec(buffer));
 * // { type: 'ico' }
 * // or
 * // { type: 'cur' }
 * // or
 * // { type: 'unknown' }
 * ```
 */
export function convert(pattern: BinpatPattern, fn: (value: any, ctx?: BinpatContext) => any) {
  function handler(dv: DataView, ctx: BinpatContext) {
    const value = exec(dv, pattern, ctx);
    return fn(value, ctx);
  }
  handler[BINPAT_TYPE] = 'convert';
  return handler;
}

/**
 * Move current offset to the given offset.
 * @param offset
 *
 * @example Usage
 * ```js
 * import Binpat, { seek, omit, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   foo: u8(),
 *   [omit('padding')]: seek((ctx) => ctx.offset + 4),
 *   bar: u8(),
 * });
 * const { buffer } = new Uint8Array([1, 0, 0, 0, 0, 2]);
 * console.log(binpat.exec(buffer));
 * // { foo: 1, bar: 2 }
 * ```
 */
export function seek(offset: number | ((ctx: BinpatContext) => number)) {
  function handler(dv: DataView, ctx: BinpatContext) {
    ctx.offset = typeof offset === 'function' ? offset(ctx) : offset;
  }
  handler[BINPAT_TYPE] = 'seek';
  return handler;
}

/**
 * Reads pattern from the given offset, and doesn't move current offset.
 * @param offset
 * @param pattern
 *
 * @example Usage
 * ```js
 * import Binpat, { peek, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   size: u32(),
 *   address: u32(),
 *   data: peek(
 *     (ctx) => ctx.data.address,
 *     array(u8(), (ctx) => ctx.data.size),
 *   ),
 * });
 * ```
 */
export function peek(offset: number | ((ctx: BinpatContext) => number), pattern: any) {
  function handler(dv: DataView, ctx: BinpatContext) {
    const currentOffset = ctx.offset;
    ctx.offset = typeof offset === 'function' ? offset(ctx) : offset;
    const value = exec(dv, pattern, ctx);
    ctx.offset = currentOffset;
    return value;
  }
  handler[BINPAT_TYPE] = 'peek';
  return handler;
}

/**
 * Move forward with the given offset. `skip(x)` is same as `seek((ctx) => ctx.offset + x)`
 * @param offset
 *
 * @example Usage
 * ```js
 * import Binpat, { skip, omit, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   foo: u8(),
 *   [omit('padding')]: skip(4),
 *   bar: u8(),
 * });
 * const { buffer } = new Uint8Array([1, 0, 0, 0, 0, 2]);
 * console.log(binpat.exec(buffer));
 * // { foo: 1, bar: 2 }
 * ```
 */
export function skip(offset: number) {
  function handler(dv: DataView, ctx: BinpatContext) {
    ctx.offset += offset;
  }
  handler[BINPAT_TYPE] = 'skip';
  return handler;
}

function random() {
  return Math.random().toString(16).slice(2);
}

/**
 * Omit the key-value in result.
 *
 * @example Usage
 * ```js
 * import Binpat, { omit, u16 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   [omit('reserved')]: u16(),
 *   type: u16(),
 *   count: u16(),
 * });
 * console.log(binpat.exec(buffer));
 * // { type: 1, count: 1 }
 * ```
 */
export function omit(name?: string) {
  return `__BINPAT_OMIT_${random()}__`;
}

/**
 * It works like spread syntax `...`, and usually be used with `ternary()`.
 *
 * @example Usage
 * ```js
 * import Binpat, { spread, ternary, bool, u8 } from 'binpat';
 *
 * const binpat = new Binpat({
 *   flag: bool(),
 *   [spread()]: ternary(
 *     (ctx) => ctx.data.flag,
 *     { truthy: u8() },
 *     { falsy: u8() },
 *   ),
 * });
 * console.log(binpat.exec(buffer));
 * // { flag: true, truthy: 0 }
 * // or
 * // { flag: false, falsy: 0 }
 * ```
 */
export function spread() {
  return `__BINPAT_SPREAD_${random()}__`;
}
