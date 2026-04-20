/**
 * prc-parser.ts — Node.js reader/writer for Smash Ultimate .prc / .prcx param files.
 *
 * Based on https://github.com/ultimate-research/prc-rs/
 *
 * Binary format (paracobn):
 *   Header:
 *     0x00: "paracobn" magic (8 bytes)
 *     0x08: u32 hashTableSize (in bytes)
 *     0x0C: u32 refTableSize (in bytes)
 *
 *   Hash table (at offset 0x10):
 *     hashTableSize/8 entries, each a u64 Hash40 value
 *     Hash40: 40-bit value stored in 8 bytes LE — lower 32 bits = CRC32, bits 32-39 = string length
 *
 *   Ref table (at offset 0x10 + hashTableSize):
 *     Contains struct field ref-tables (pairs of u32 hashIndex + u32 paramOffset)
 *     AND null-terminated string data
 *
 *   Param data (at offset 0x10 + hashTableSize + refTableSize):
 *     Recursive param nodes, each starting with a type byte
 *
 * Param types (1-indexed to match prc-rs ParamKind enum):
 *   0x01 = Bool (1 byte value)
 *   0x02 = I8 (1 byte)
 *   0x03 = U8 (1 byte)
 *   0x04 = I16 (2 bytes LE)
 *   0x05 = U16 (2 bytes LE)
 *   0x06 = I32 (4 bytes LE)
 *   0x07 = U32 (4 bytes LE)
 *   0x08 = Float (4 bytes LE)
 *   0x09 = Hash40 (4 bytes LE — index into hash table)
 *   0x0A = String (4 bytes LE — offset into ref table for null-terminated string)
 *   0x0B = List (array): u32 count, then count × u32 offsets (relative to list start), then child params
 *   0x0C = Struct (map): u32 fieldCount, u32 refTableOffset, ref table has fieldCount pairs of
 *          (u32 hashIndex, u32 paramOffset), paramOffset relative to struct start
 */

import * as fs from 'fs';
import path from 'path';
import { PATHS } from '../config';
import { ModFileOperations } from '../mod-file-operations';
import { XMLParser } from 'fast-xml-parser';

// =====================================================================
// Hash40 utilities
// =====================================================================

const MAGIC = Buffer.from('paracobn', 'ascii');

/**
 * Represents a Hash40 value (40-bit hash used in Smash Ultimate).
 * The full u64 stores: bits 0-31 = CRC32, bits 32-39 = original string length.
 */
class Hash40 {
  value: bigint;

  constructor(value: bigint) {
    this.value = value & 0xffffffffffn; // mask to 40 bits
  }

  get crc32(): number {
    return Number(this.value & 0xffffffffn);
  }

  get length(): number {
    return Number((this.value >> 32n) & 0xffn);
  }

  /**
   * Returns hex string representation like "0a72a5a6784"
   */
  toHexString(): string {
    return this.value.toString(16).padStart(10, '0');
  }

  toString(): string {
    return `0x${this.toHexString()}`;
  }

  equals(other: Hash40): boolean {
    return this.value === other.value;
  }
}

// Pre-built CRC32 lookup table (standard polynomial 0xEDB88320)
const CRC32_TABLE = new Uint32Array(256);
(function buildCrc32Table() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    CRC32_TABLE[i] = crc >>> 0;
  }
})();

/**
 * Compute CRC32 of a string (using its UTF-8 byte representation).
 */
function crc32(str: string): number {
  const buf = Buffer.from(str, 'utf8');
  let crc = 0xffffffff;

  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Compute a Hash40 from a label string.
 */
function hashLabel(label: string): Hash40 {
  const len = Buffer.byteLength(label, 'utf8');
  const crcVal = crc32(label);
  const value = (BigInt(len) << 32n) | BigInt(crcVal);
  return new Hash40(value);
}

// =====================================================================
// ParamKind — mirrors prc-rs ParamKind enum
// =====================================================================

const ParamType = {
  BOOL: 1,
  I8: 2,
  U8: 3,
  I16: 4,
  U16: 5,
  I32: 6,
  U32: 7,
  FLOAT: 8,
  HASH: 9,
  STR: 10,
  LIST: 11,
  STRUCT: 12,
} as const;

type ParamTypeValue = (typeof ParamType)[keyof typeof ParamType];

const ParamTypeName: Record<number, string> = Object.fromEntries(
  Object.entries(ParamType).map(([k, v]) => [v, k.toLowerCase()]),
);

/** A list of key-value pairs: [Hash40, ParamKind] */
type ParamStruct = Array<[Hash40, ParamKind]>;

/** A list of ParamKind values */
type ParamList = ParamKind[];

/**
 * A param value node.
 */
class ParamKind {
  type: ParamTypeValue;
  value: boolean | number | string | Hash40 | ParamList | ParamStruct;

  constructor(
    type: ParamTypeValue,
    value: boolean | number | string | Hash40 | ParamList | ParamStruct,
  ) {
    this.type = type;
    this.value = value;
  }

  get typeName(): string {
    return ParamTypeName[this.type] || `unknown(${this.type})`;
  }

  static bool(v: boolean) {
    return new ParamKind(ParamType.BOOL, v);
  }

  static i8(v: number) {
    return new ParamKind(ParamType.I8, v);
  }

  static u8(v: number) {
    return new ParamKind(ParamType.U8, v);
  }

  static i16(v: number) {
    return new ParamKind(ParamType.I16, v);
  }

  static u16(v: number) {
    return new ParamKind(ParamType.U16, v);
  }

  static i32(v: number) {
    return new ParamKind(ParamType.I32, v);
  }

  static u32(v: number) {
    return new ParamKind(ParamType.U32, v);
  }

  static float(v: number) {
    return new ParamKind(ParamType.FLOAT, v);
  }

  static hash(v: Hash40) {
    return new ParamKind(ParamType.HASH, v);
  }

  static str(v: string) {
    return new ParamKind(ParamType.STR, v);
  }

  static list(v: ParamList) {
    return new ParamKind(ParamType.LIST, v);
  }

  static struct(v: ParamStruct) {
    return new ParamKind(ParamType.STRUCT, v);
  }
}

/**
 * Cursor wrapping a Buffer for sequential reading.
 */
class BufferCursor {
  buf: Buffer;
  pos: number;

  constructor(buffer: Buffer, offset = 0) {
    this.buf = buffer;
    this.pos = offset;
  }

  seek(pos: number) {
    this.pos = pos;
  }

  tell(): number {
    return this.pos;
  }

  readU8(): number {
    const v = this.buf.readUInt8(this.pos);
    this.pos += 1;
    return v;
  }

  readI8(): number {
    const v = this.buf.readInt8(this.pos);
    this.pos += 1;
    return v;
  }

  readU16LE(): number {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readI16LE(): number {
    const v = this.buf.readInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readU32LE(): number {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readI32LE(): number {
    const v = this.buf.readInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readF32LE(): number {
    const v = this.buf.readFloatLE(this.pos);
    this.pos += 4;
    return v;
  }

  /**
   * Read a Hash40 (8 bytes LE, only lower 40 bits meaningful).
   */
  readHash40LE(): Hash40 {
    const lo = this.buf.readUInt32LE(this.pos);
    const hi = this.buf.readUInt32LE(this.pos + 4);
    this.pos += 8;
    // Hash40 is 40 bits: hi byte (bits 32-39) = string length, lo (bits 0-31) = crc32
    return new Hash40((BigInt(hi) << 32n) | BigInt(lo));
  }

  readNullTermString(): string {
    let str = '';

    while (this.pos < this.buf.length) {
      const ch = this.buf[this.pos++];
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }
    return str;
  }
}

interface RefTableEntry {
  hashIndex: number;
  paramOffset: number;
}

/**
 * Read/disassemble a binary prc/prcx file into a ParamStruct.
 */
function readPrc(buf: Buffer): ParamStruct {
  const cursor = new BufferCursor(buf);

  // Validate magic
  const magic = buf.slice(0, 8);
  if (!magic.equals(MAGIC)) {
    throw new Error(
      `Invalid file magic: expected "paracobn", got "${magic.toString('ascii')}"`,
    );
  }
  cursor.seek(8);

  const hashTableSize = cursor.readU32LE();
  const refTableSize = cursor.readU32LE();

  const hashStart = cursor.tell(); // 0x10
  const refStart = hashStart + hashTableSize;
  const paramStart = refStart + refTableSize;
  const hashCount = hashTableSize / 8;

  // Build hash table
  const hashTable: Hash40[] = [];
  for (let i = 0; i < hashCount; i++) {
    hashTable.push(cursor.readHash40LE());
  }

  // Cache for ref tables (keyed by refTableOffset) — mirrors prc-rs ref_tables HashMap
  const refTablesCache = new Map<number, RefTableEntry[]>();

  /**
   * Read a ref table from the ref section at the given offset.
   * Returns array of { hashIndex, paramOffset } pairs sorted by hashIndex.
   * Uses cache to avoid re-reading shared tables.
   */
  function getRefTable(refOffset: number, size: number): RefTableEntry[] {
    if (refTablesCache.has(refOffset)) {
      return refTablesCache.get(refOffset)!;
    }
    const saved = cursor.tell();
    cursor.seek(refStart + refOffset);
    const table: RefTableEntry[] = [];
    for (let i = 0; i < size; i++) {
      table.push({
        hashIndex: cursor.readU32LE(),
        paramOffset: cursor.readU32LE(),
      });
    }
    table.sort((a, b) => a.hashIndex - b.hashIndex);
    cursor.seek(saved);
    refTablesCache.set(refOffset, table);
    return table;
  }

  /**
   * Recursively read a param node at the current cursor position.
   */
  function readParam(): ParamKind {
    const typeByte = cursor.readU8();

    switch (typeByte) {
      case ParamType.BOOL:
        return ParamKind.bool(cursor.readU8() !== 0);

      case ParamType.I8:
        return ParamKind.i8(cursor.readI8());

      case ParamType.U8:
        return ParamKind.u8(cursor.readU8());

      case ParamType.I16:
        return ParamKind.i16(cursor.readI16LE());

      case ParamType.U16:
        return ParamKind.u16(cursor.readU16LE());

      case ParamType.I32:
        return ParamKind.i32(cursor.readI32LE());

      case ParamType.U32:
        return ParamKind.u32(cursor.readU32LE());

      case ParamType.FLOAT:
        return ParamKind.float(cursor.readF32LE());

      case ParamType.HASH: {
        const idx = cursor.readI32LE();
        return ParamKind.hash(hashTable[idx]);
      }

      case ParamType.STR: {
        const strOffset = cursor.readU32LE();
        const saved = cursor.tell();
        cursor.seek(refStart + strOffset);
        const str = cursor.readNullTermString();
        // Note: prc-rs does NOT seek back after reading a string
        // (the comment in disasm.rs says "remembering where we were is actually unnecessary")
        // but we do to support sequential reading in lists/structs that may follow
        cursor.seek(saved);
        return ParamKind.str(str);
      }

      case ParamType.LIST: {
        // pos is right after the type byte; prc-rs uses pos = cursor - 1
        const listStart = cursor.tell() - 1;
        const count = cursor.readU32LE();
        // Read offset table
        const offsets: number[] = [];
        for (let i = 0; i < count; i++) {
          offsets.push(cursor.readU32LE());
        }
        // Read each child param at listStart + offset
        const items: ParamKind[] = [];
        for (let i = 0; i < count; i++) {
          cursor.seek(listStart + offsets[i]);
          items.push(readParam());
        }
        return ParamKind.list(items);
      }

      case ParamType.STRUCT: {
        const structStart = cursor.tell() - 1;
        const fieldCount = cursor.readU32LE();
        const refOffset = cursor.readU32LE();

        const table = getRefTable(refOffset, fieldCount);

        const fields: ParamStruct = [];
        for (const { hashIndex, paramOffset } of table) {
          cursor.seek(structStart + paramOffset);
          fields.push([hashTable[hashIndex], readParam()]);
        }
        return ParamKind.struct(fields);
      }

      default:
        throw new Error(
          `Unknown param type 0x${typeByte.toString(16)} at offset 0x${(cursor.tell() - 1).toString(16)}`,
        );
    }
  }

  // Root must be a struct (type 0x0C)
  cursor.seek(paramStart);
  const rootTypeByte = cursor.readU8();
  if (rootTypeByte !== ParamType.STRUCT) {
    throw new Error(
      `Param file does not contain a root struct (got type 0x${rootTypeByte.toString(16)})`,
    );
  }
  cursor.seek(paramStart); // seek back so readParam reads the type byte
  const rootParam = readParam();
  return rootParam.value as ParamStruct; // unwrap the ParamStruct from the ParamKind
}

/**
 * Read a prc/prcx file from disk.
 */
function openPrc(filePath: string): ParamStruct {
  const buf = fs.readFileSync(filePath);
  return readPrc(buf);
}

// =====================================================================
// Writer — assemble ParamStruct into binary prc/prcx
// =====================================================================

/**
 * Growable buffer writer for sequential LE writes.
 */
class BufferWriter {
  buf: Buffer;
  pos: number;
  length: number;

  constructor(initialSize = 4096) {
    this.buf = Buffer.alloc(initialSize);
    this.pos = 0;
    this.length = 0;
  }

  _ensureCapacity(needed: number) {
    const required = this.pos + needed;
    if (required > this.buf.length) {
      let newSize = this.buf.length * 2;
      while (newSize < required) newSize *= 2;
      const newBuf = Buffer.alloc(newSize);
      this.buf.copy(newBuf);
      this.buf = newBuf;
    }
  }

  _advance(n: number) {
    this.pos += n;
    if (this.pos > this.length) this.length = this.pos;
  }

  seek(pos: number) {
    this.pos = pos;
  }

  tell(): number {
    return this.pos;
  }

  writeU8(v: number) {
    this._ensureCapacity(1);
    this.buf.writeUInt8(v, this.pos);
    this._advance(1);
  }

  writeI8(v: number) {
    this._ensureCapacity(1);
    this.buf.writeInt8(v, this.pos);
    this._advance(1);
  }

  writeU16LE(v: number) {
    this._ensureCapacity(2);
    this.buf.writeUInt16LE(v, this.pos);
    this._advance(2);
  }

  writeI16LE(v: number) {
    this._ensureCapacity(2);
    this.buf.writeInt16LE(v, this.pos);
    this._advance(2);
  }

  writeU32LE(v: number) {
    this._ensureCapacity(4);
    this.buf.writeUInt32LE(v, this.pos);
    this._advance(4);
  }

  writeI32LE(v: number) {
    this._ensureCapacity(4);
    this.buf.writeInt32LE(v, this.pos);
    this._advance(4);
  }

  writeF32LE(v: number) {
    this._ensureCapacity(4);
    this.buf.writeFloatLE(v, this.pos);
    this._advance(4);
  }

  writeHash40LE(hash40: Hash40) {
    const val = hash40.value;
    const lo = Number(val & 0xffffffffn);
    const hi = Number((val >> 32n) & 0xffffffffn);
    this._ensureCapacity(8);
    this.buf.writeUInt32LE(lo, this.pos);
    this.buf.writeUInt32LE(hi, this.pos + 4);
    this._advance(8);
  }

  writeBuffer(srcBuf: Buffer) {
    this._ensureCapacity(srcBuf.length);
    srcBuf.copy(this.buf, this.pos);
    this._advance(srcBuf.length);
  }

  writeString(str: string) {
    const strBuf = Buffer.from(str, 'utf8');
    this.writeBuffer(strBuf);
    this.writeU8(0); // null terminator
  }

  toBuffer(): Buffer {
    return this.buf.slice(0, this.length);
  }
}

// Ref entry types used during assembly (mirrors prc-rs RefEntry enum)
const REF_STRING = 'string' as const;
const REF_TABLE = 'table' as const;

interface RefEntryString {
  type: typeof REF_STRING;
  data: string;
  paramOffset: number;
  isDuplicate: boolean;
  refOffset: number;
}

interface RefEntryTable {
  type: typeof REF_TABLE;
  data: Array<[number, number]>;
  paramOffset: number;
  isDuplicate: boolean;
  refOffset: number;
}

type RefEntry = RefEntryString | RefEntryTable;

/**
 * Write/assemble a ParamStruct into a binary prc buffer.
 */
function writePrc(paramStruct: ParamStruct): Buffer {
  // Phase 1: Collect all unique hashes (hash table always starts with Hash40(0))
  const hashIndexMap = new Map<bigint, number>();
  hashIndexMap.set(0n, 0);
  const hashList: Hash40[] = [new Hash40(0n)];

  function addHash(hash40: Hash40) {
    const key = hash40.value;
    if (!hashIndexMap.has(key)) {
      hashIndexMap.set(key, hashList.length);
      hashList.push(hash40);
    }
  }

  function collectHashes(param: ParamKind) {
    switch (param.type) {
      case ParamType.HASH:
        addHash(param.value as Hash40);
        break;
      case ParamType.LIST:
        for (const child of param.value as ParamList) {
          collectHashes(child);
        }
        break;
      case ParamType.STRUCT:
        for (const [hash, child] of param.value as ParamStruct) {
          addHash(hash);
          collectHashes(child);
        }
        break;
    }
  }

  // Collect from root struct
  for (const [hash, child] of paramStruct) {
    addHash(hash);
    collectHashes(child);
  }

  // Phase 2: Write param data to a temporary buffer, collecting ref entries
  const refEntries: RefEntry[] = [];
  const paramWriter = new BufferWriter();

  function writeParam(param: ParamKind) {
    switch (param.type) {
      case ParamType.BOOL:
        paramWriter.writeU8(1);
        paramWriter.writeU8(param.value ? 1 : 0);
        break;

      case ParamType.I8:
        paramWriter.writeU8(2);
        paramWriter.writeI8(param.value as number);
        break;

      case ParamType.U8:
        paramWriter.writeU8(3);
        paramWriter.writeU8(param.value as number);
        break;

      case ParamType.I16:
        paramWriter.writeU8(4);
        paramWriter.writeI16LE(param.value as number);
        break;

      case ParamType.U16:
        paramWriter.writeU8(5);
        paramWriter.writeU16LE(param.value as number);
        break;

      case ParamType.I32:
        paramWriter.writeU8(6);
        paramWriter.writeI32LE(param.value as number);
        break;

      case ParamType.U32:
        paramWriter.writeU8(7);
        paramWriter.writeU32LE(param.value as number);
        break;

      case ParamType.FLOAT:
        paramWriter.writeU8(8);
        paramWriter.writeF32LE(param.value as number);
        break;

      case ParamType.HASH:
        paramWriter.writeU8(9);
        paramWriter.writeU32LE(
          hashIndexMap.get((param.value as Hash40).value)!,
        );
        break;

      case ParamType.STR: {
        paramWriter.writeU8(10);
        refEntries.push({
          type: REF_STRING,
          data: param.value as string,
          paramOffset: paramWriter.tell(),
          isDuplicate: false,
          refOffset: 0,
        });
        paramWriter.writeU32LE(0); // placeholder
        break;
      }

      case ParamType.LIST: {
        const startPos = paramWriter.tell();
        paramWriter.writeU8(11);
        const items = param.value as ParamList;
        paramWriter.writeU32LE(items.length);

        // Reserve space for offset table
        const tableStart = paramWriter.tell();
        for (let i = 0; i < items.length; i++) {
          paramWriter.writeU32LE(0); // placeholder
        }

        // Write each child and patch offsets
        for (let i = 0; i < items.length; i++) {
          const childPos = paramWriter.tell();
          // Patch offset: relative to startPos
          const savedPos = paramWriter.tell();
          paramWriter.seek(tableStart + i * 4);
          paramWriter.writeU32LE(childPos - startPos);
          paramWriter.seek(savedPos);

          writeParam(items[i]);
        }
        break;
      }

      case ParamType.STRUCT:
        writeParamStruct(param.value as ParamStruct);
        break;
    }
  }

  function writeParamStruct(fields: ParamStruct) {
    const startPos = paramWriter.tell();
    paramWriter.writeU8(12);
    paramWriter.writeU32LE(fields.length);
    paramWriter.writeU32LE(0); // placeholder for ref offset

    // Sort fields by hash index (as prc-rs does)
    const sorted = fields
      .map(([hash, param]) => ({
        hash,
        param,
        hashIdx: hashIndexMap.get(hash.value)!,
      }))
      .sort((a, b) => a.hashIdx - b.hashIdx);

    // Create ref table entry
    const tableData: Array<[number, number]> = [];
    refEntries.push({
      type: REF_TABLE,
      data: tableData,
      paramOffset: startPos + 5, // offset of the ref-offset u32 in param data
      isDuplicate: false,
      refOffset: 0,
    });

    for (const { param, hashIdx } of sorted) {
      const childOffset = paramWriter.tell() - startPos;
      tableData.push([hashIdx, childOffset]);
      writeParam(param);
    }
  }

  writeParamStruct(paramStruct);

  // Phase 3: Deduplicate ref entries and assign offsets (mirrors prc-rs handle_ref_entries)
  let refOffset = 0;
  for (let i = 0; i < refEntries.length; i++) {
    let foundDuplicate = false;
    for (let j = i - 1; j >= 0; j--) {
      if (refEntriesEqual(refEntries[i], refEntries[j])) {
        refEntries[i].isDuplicate = true;
        refEntries[i].refOffset = refEntries[j].refOffset;
        foundDuplicate = true;
        break;
      }
    }
    if (!foundDuplicate) {
      refEntries[i].refOffset = refOffset;
      if (refEntries[i].type === REF_STRING) {
        refOffset +=
          Buffer.byteLength((refEntries[i] as RefEntryString).data, 'utf8') + 1;
      } else {
        refOffset += (refEntries[i] as RefEntryTable).data.length * 8;
      }
    }
  }

  // Phase 4: Patch ref offsets into param data and write ref section
  const refWriter = new BufferWriter();

  for (const entry of refEntries) {
    // Patch the placeholder in param data with the actual ref offset
    paramWriter.seek(entry.paramOffset);
    paramWriter.writeU32LE(entry.refOffset);

    // Write actual ref data (only for non-duplicates)
    if (!entry.isDuplicate) {
      if (entry.type === REF_STRING) {
        refWriter.writeString(entry.data);
      } else {
        for (const [hashIdx, offset] of entry.data) {
          refWriter.writeU32LE(hashIdx);
          refWriter.writeU32LE(offset);
        }
      }
    }
  }

  // Phase 5: Assemble final buffer
  const hashSize = hashList.length * 8;
  const refBuf = refWriter.toBuffer();
  const paramBuf = paramWriter.toBuffer();

  const output = new BufferWriter(
    8 + 4 + 4 + hashSize + refBuf.length + paramBuf.length,
  );

  // Header
  output.writeBuffer(MAGIC);
  output.writeU32LE(hashSize);
  output.writeU32LE(refBuf.length);

  // Hash table
  for (const hash of hashList) {
    output.writeHash40LE(hash);
  }

  // Ref table
  output.writeBuffer(refBuf);

  // Param data
  output.writeBuffer(paramBuf);

  return output.toBuffer();
}

function refEntriesEqual(a: RefEntry, b: RefEntry): boolean {
  if (a.type !== b.type) return false;
  if (a.type === REF_STRING && b.type === REF_STRING) return a.data === b.data;
  // REF_TABLE: compare arrays of [hashIndex, paramOffset] pairs
  const aData = a.data as Array<[number, number]>;
  const bData = b.data as Array<[number, number]>;
  if (aData.length !== bData.length) return false;
  for (let i = 0; i < aData.length; i++) {
    if (aData[i][0] !== bData[i][0] || aData[i][1] !== bData[i][1]) {
      return false;
    }
  }
  return true;
}

/**
 * Save a ParamStruct to a prc/prcx file.
 */
function savePrc(filePath: string, paramStruct: ParamStruct) {
  const buf = writePrc(paramStruct);
  fs.writeFileSync(filePath, buf);
}

// =====================================================================
// Hash label dictionary — resolve Hash40 values to human-readable names
// =====================================================================

/** hash40.value -> label */
const _hashLabels = new Map<bigint, string>();

/**
 * Load hash labels from a newline-delimited text file.
 * Each line is a label string; its Hash40 is computed and stored.
 */
function loadHashLabels(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const label = line.trim();
    if (!label) continue;
    const hash = hashLabel(label);
    _hashLabels.set(hash.value, label);
  }
}

/**
 * Manually add a hash label mapping.
 */
function addHashLabel(label: string) {
  const hash = hashLabel(label);
  _hashLabels.set(hash.value, label);
}

/**
 * Resolve a Hash40 to its label string, or return the hex representation.
 */
function resolveHash(hash40: Hash40): string {
  if (hash40.value === 0n) return '';
  return _hashLabels.get(hash40.value) || hash40.toString();
}

// =====================================================================
// JSON serialization — convert ParamStruct to/from plain JSON
// =====================================================================

/**
 * Convert a ParamKind to a JSON-serializable object.
 */
function paramToJson(param: ParamKind): object {
  switch (param.type) {
    case ParamType.BOOL:
    case ParamType.I8:
    case ParamType.U8:
    case ParamType.I16:
    case ParamType.U16:
    case ParamType.I32:
    case ParamType.U32:
    case ParamType.FLOAT:
    case ParamType.STR:
      return { type: param.typeName, value: param.value };

    case ParamType.HASH:
      return {
        type: 'hash',
        value: resolveHash(param.value as Hash40),
        raw: (param.value as Hash40).toHexString(),
      };

    case ParamType.LIST:
      return {
        type: 'list',
        value: (param.value as ParamList).map(paramToJson),
      };

    case ParamType.STRUCT:
      return {
        type: 'struct',
        value: (param.value as ParamStruct).map(([hash, child]) => ({
          key: resolveHash(hash),
          keyRaw: hash.toHexString(),
          value: paramToJson(child),
        })),
      };

    default:
      return { type: 'unknown', value: null };
  }
}

/**
 * Convert a root ParamStruct to JSON-serializable form.
 */
function structToJson(paramStruct: ParamStruct): object {
  return paramToJson(ParamKind.struct(paramStruct));
}

/**
 * Pretty-print a ParamStruct to the console.
 */
function printStruct(paramStruct: ParamStruct, indent = 0) {
  printParam(ParamKind.struct(paramStruct), indent);
}

/**
 * Pretty-print a ParamKind to the console.
 */
function printParam(param: ParamKind, indent = 0) {
  const pad = '  '.repeat(indent);

  switch (param.type) {
    case ParamType.STRUCT: {
      console.log(`${pad}struct {`);
      for (const [hash, child] of param.value as ParamStruct) {
        process.stdout.write(`${pad}  ${resolveHash(hash)}: `);
        printParam(child, indent + 1);
      }
      console.log(`${pad}}`);
      break;
    }
    case ParamType.LIST: {
      const items = param.value as ParamList;
      console.log(`${pad}list[${items.length}] [`);
      for (let i = 0; i < items.length; i++) {
        process.stdout.write(`${pad}  [${i}]: `);
        printParam(items[i], indent + 1);
      }
      console.log(`${pad}]`);
      break;
    }
    case ParamType.HASH:
      console.log(`${resolveHash(param.value as Hash40)}`);
      break;
    case ParamType.BOOL:
      console.log(`${param.value}`);
      break;
    case ParamType.FLOAT:
      console.log(`${param.value}`);
      break;
    case ParamType.STR:
      console.log(`"${param.value}"`);
      break;
    default:
      console.log(`${param.value}`);
      break;
  }
}

// =====================================================================
// POJO conversion — convert ParamStruct to plain JS objects
// =====================================================================

/**
 * Convert a ParamKind to a plain JS value (POJO).
 * - Bool/I8/U8/I16/U16/I32/U32/Float/Str → primitive value
 * - Hash → resolved label string (or hex string)
 * - List → array of converted children
 * - Struct → object with resolved key names mapped to converted children
 */
function paramToPojo(param: ParamKind): unknown {
  switch (param.type) {
    case ParamType.BOOL:
    case ParamType.I8:
    case ParamType.U8:
    case ParamType.I16:
    case ParamType.U16:
    case ParamType.I32:
    case ParamType.U32:
    case ParamType.FLOAT:
    case ParamType.STR:
      return param.value;

    case ParamType.HASH:
      return resolveHash(param.value as Hash40);

    case ParamType.LIST:
      return (param.value as ParamList).map(paramToPojo);

    case ParamType.STRUCT:
      return structToPojo(param.value as ParamStruct);

    default:
      return null;
  }
}

/**
 * Convert a ParamStruct (array of [Hash40, ParamKind] pairs) to a plain object.
 * Keys are resolved hash label strings; values are recursively converted.
 */
function structToPojo(paramStruct: ParamStruct): Record<string, unknown> {
  const obj: Record<string, unknown> = {};

  for (const [hash, child] of paramStruct) {
    const key = resolveHash(hash) || hash.toHexString();
    obj[key] = paramToPojo(child);
  }

  return obj;
}

const _characterIndexes = Array.from({ length: 16 }, (_, i) => i);

const _builtinLabels = [
  ..._characterIndexes.flatMap((char) => [
    `n${char.toString().padStart(2, '0')}_index`,
    `c${char.toString().padStart(2, '0')}_index`,
    `c${char.toString().padStart(2, '0')}_group`,
    `characall_label_c${char.toString().padStart(2, '00')}`,
    `characall_label_article_c${char.toString().padStart(2, '00')}`,
  ]),
];

for (const label of _builtinLabels) {
  addHashLabel(label);
}

/**
 * High-level parser for Smash Ultimate .prc / .prcx param files.
 * Reads a binary param file and returns the data as a plain JS object (POJO).
 */
export class PRCParser {
  static hashLabelsLoaded = false;

  static async loadHashLabels() {
    if (this.hashLabelsLoaded) return;

    const baseDbPath = path.join(PATHS.dataDir(), 'ui_chara_db.xml');
    const baseDbContent = await ModFileOperations.readModFile(baseDbPath);
    const parser = new XMLParser({
      ignoreAttributes: false,
    });

    const parsedXml = parser.parse(baseDbContent);

    // Traverse the parsed XML tree and collect all @_hash attribute values
    // from leaf nodes, then register them as hash labels for resolution.
    const hashValues = new Set<string>();

    function collectHashAttrs(node: unknown): void {
      if (node === null || node === undefined) return;
      if (typeof node !== 'object') return;

      if (Array.isArray(node)) {
        for (const item of node) {
          collectHashAttrs(item);
        }

        return;
      }

      const obj = node as Record<string, unknown>;

      // Check if this node has an @_hash attribute
      if (typeof obj['@_hash'] === 'string') {
        // Determine if this is a leaf: no child objects/arrays (only primitives and attributes)
        const isLeaf = Object.keys(obj).every((key) => {
          if (key.startsWith('@_')) return true; // attributes don't count
          if (key === '#text') return true; // text content is a leaf value
          return typeof obj[key] !== 'object' || obj[key] === null;
        });

        if (isLeaf) {
          hashValues.add(obj['@_hash'] as string);

          if (typeof obj['#text'] === 'string') {
            hashValues.add(obj['#text'] as string);
          }
        }
      }

      // Recurse into child properties
      for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith('@_') || key === '#text') continue;
        collectHashAttrs(value);
      }
    }

    collectHashAttrs(parsedXml);

    // Register discovered labels for hash resolution
    for (const label of hashValues) {
      addHashLabel(label);
    }

    addHashLabel('db_root');

    this.hashLabelsLoaded = true;
  }
  /**
   * Parse a .prc / .prcx file at the given path and return the result as a
   * plain JavaScript object. Struct fields become object keys (resolved to
   * human-readable labels where possible), lists become arrays, and
   * primitive param values become their JS equivalents.
   */
  static async parse(filePath: string): Promise<Record<string, unknown>> {
    await this.loadHashLabels();
    const paramStruct = openPrc(filePath);
    return structToPojo(paramStruct);
  }

  /**
   * Register additional hash labels so that Hash40 keys can be resolved
   * to human-readable names. Call before parsing if you have extra labels.
   */
  static addLabels(labels: string[]) {
    for (const label of labels) {
      addHashLabel(label);
    }
  }

  /**
   * Load additional hash labels from a newline-delimited text file.
   */
  static loadLabelsFromFile(filePath: string) {
    loadHashLabels(filePath);
  }
}

(async () => {
  console.log(
    await PRCParser.parse(path.join(PATHS.testDir(), 'ui_chara_db.prc')),
  );
})().catch((e) => {
  console.error('Error parsing PRC file:', e);
});
