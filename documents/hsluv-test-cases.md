# HSLuv/HPLuv Reference Cases

This file captures a snapshot of canonical conversion values derived from the embedded `lib/hsluv.ts` port.

- Reference implementation: [`hsluv` npm package v1.0.1](https://www.npmjs.com/package/hsluv).
- Verification: convert each hex swatch to HSLuv/HPLuv and back to hex, asserting parity with the reference implementation (roundtrip checks on HPLuv are only meaningful when `p ≤ 100`, which is the safe gamut for pastels).
- Formatting: values rounded to two decimals to match the UI defaults (`formatHslString`).

| Hex     | HSLuv (h, s, l) | HPLuv (h, s, l) |
|---------|-----------------|-----------------|
| `#000000` | `0.00, 0.00, 0.00`   | `0.00, 0.00, 0.00`   |
| `#FFFFFF` | `0.00, 0.00, 100.00` | `0.00, 0.00, 100.00` |
| `#123456` | `248.61, 85.43, 21.04` | `248.61, 179.07, 21.04` |
| `#FF6B6B` | `12.18, 100.00, 64.03` | `12.18, 224.01, 64.03` |
| `#1D3557` | `251.50, 72.04, 21.93` | `251.50, 166.68, 21.93` |
| `#F4A261` | `38.47, 80.38, 73.51` | `38.47, 139.41, 73.51` |
| `#2A9D8F` | `176.56, 91.23, 58.59` | `176.56, 92.80, 58.59` |
| `#E76F51` | `20.64, 69.04, 60.74` | `20.64, 207.94, 60.74` |
| `#FFD166` | `61.96, 100.00, 85.92` | `61.96, 244.26, 85.92` |
| `#06D6A0` | `154.97, 99.62, 76.48` | `154.97, 120.95, 76.48` |
| `#EF476F` | `2.91, 81.68, 56.10` | `2.91, 266.55, 56.10` |

Notes:

- HPLuv saturation (`p`) can exceed `100` for highly saturated colors (e.g. `#FF6B6B`). This mirrors the behaviour of the upstream reference and signals that the requested color lies outside the “safe pastel” gamut. Clamp with `clampHsluv` before presenting values to users.
- The UI should continue to round to two decimals and use `formatHslString`/`parseHslString` for consistency.
