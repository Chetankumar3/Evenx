// Seat bitmap decoding. The server sends a bitmap encoding 2 bits per seat:
//   00 = empty, 01 = locked, 10 = booked  (values match C.seatStatus)
// The bitmap may arrive as base64 OR hex; we sniff which.
import { C } from '../contract'

function isHex(str) {
  return /^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0
}

// Turn the wire string into a Uint8Array of bytes.
export function bitmapToBytes(str) {
  if (!str) return new Uint8Array(0)

  // Hex if it cleanly parses as hex AND isn't obviously base64 with +/=.
  if (isHex(str) && !/[+/=]/.test(str)) {
    const bytes = new Uint8Array(str.length / 2)
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(str.substr(i * 2, 2), 16)
    }
    return bytes
  }

  // Otherwise treat as base64.
  try {
    const bin = atob(str)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return new Uint8Array(0)
  }
}

// Read the 2-bit status for seat index `n` (0-based).
// Bits are packed MSB-first within each byte: seat 0 -> bits 7..6, etc.
export function seatStatusAt(bytes, n) {
  const byteIdx = Math.floor(n / 4)
  if (byteIdx >= bytes.length) return C.seatStatus.EMPTY
  const within = n % 4 // 0..3
  const shift = 6 - within * 2
  return (bytes[byteIdx] >> shift) & 0b11
}

// Decode the full bitmap into an array of statuses of length `totalSeats`.
// If totalSeats is unknown, derive it from the byte length (4 seats/byte).
export function decodeBitmap(str, totalSeats) {
  const bytes = bitmapToBytes(str)
  const count =
    totalSeats && totalSeats > 0 ? totalSeats : bytes.length * 4
  const out = new Array(count)
  for (let i = 0; i < count; i++) out[i] = seatStatusAt(bytes, i)
  return out
}
