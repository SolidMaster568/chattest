import gzip
import zipfile
from pathlib import Path

ASSETS = Path(__file__).parent / "src" / "assets"
OUTPUT = ASSETS / "sticker"


def extract_pack(zip_path: Path) -> int:
    """Decompress every .tgs in one zip into its own output folder."""
    out_dir = OUTPUT / zip_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    count = 0
    with zipfile.ZipFile(zip_path) as archive:
        for member in archive.namelist():
            if not member.endswith(".tgs"):
                continue
            data = gzip.decompress(archive.read(member))
            (out_dir / (Path(member).stem + ".json")).write_bytes(data)
            count += 1

    print(f"{zip_path.name}: {count} stickers -> {out_dir}")
    return count


def main() -> None:
    zips = sorted(ASSETS.glob("*.zip"))
    if not zips:
        print(f"No zip files found in {ASSETS}")
        return

    total = sum(extract_pack(z) for z in zips)
    print(f"\nDone. {len(zips)} packs, {total} stickers.")


if __name__ == "__main__":
    main()
