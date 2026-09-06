"""Gera os icones PNG do PWA sem dependencias externas."""

from pathlib import Path
import struct
import zlib

BLUE = (74, 144, 217, 255)
WHITE = (255, 255, 255, 255)
GLYPHS = {
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
}


def png_chunk(kind, data):
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def create_png(size, target):
    pixels = [[BLUE for _ in range(size)] for _ in range(size)]
    scale = max(1, size // 80)
    glyph_width = 5 * scale
    glyph_height = 7 * scale
    gap = 2 * scale
    start_x = (size - (glyph_width * 2 + gap)) // 2
    start_y = (size - glyph_height) // 2

    for glyph_index, glyph in enumerate(("M", "F")):
        bitmap = GLYPHS[glyph]
        offset_x = start_x + glyph_index * (glyph_width + gap)
        for row, line in enumerate(bitmap):
            for column, value in enumerate(line):
                if value != "1":
                    continue
                for y in range(row * scale, (row + 1) * scale):
                    for x in range(column * scale, (column + 1) * scale):
                        pixels[start_y + y][offset_x + x] = WHITE

    raw = b"".join(b"\x00" + b"".join(bytes(pixel) for pixel in row) for row in pixels)
    png = b"\x89PNG\r\n\x1a\n"
    png += png_chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += png_chunk(b"IDAT", zlib.compress(raw, 9))
    png += png_chunk(b"IEND", b"")
    target.write_bytes(png)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    assets = root / "assets"
    assets.mkdir(exist_ok=True)
    create_png(192, assets / "icon-192.png")
    create_png(512, assets / "icon-512.png")
    print("Icones gerados em assets/")
