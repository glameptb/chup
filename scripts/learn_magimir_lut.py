from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


def list_pairs(raw_dir: Path, target_dir: Path) -> list[tuple[Path, Path]]:
    raw_files = {path.name: path for path in raw_dir.iterdir() if path.suffix.lower() in IMAGE_EXTENSIONS}
    target_files = {path.name: path for path in target_dir.iterdir() if path.suffix.lower() in IMAGE_EXTENSIONS}
    names = sorted(set(raw_files) & set(target_files))
    return [(raw_files[name], target_files[name]) for name in names]


def load_rgb(path: Path, max_side: int | None = None) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    if max_side and max(image.size) > max_side:
      image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.float32) / 255.0


def resize_to(array: np.ndarray, size: tuple[int, int]) -> np.ndarray:
    image = Image.fromarray(np.clip(array * 255.0, 0, 255).astype(np.uint8), "RGB")
    image = image.resize(size, Image.Resampling.LANCZOS)
    return np.asarray(image, dtype=np.float32) / 255.0


def features(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0]
    g = rgb[..., 1]
    b = rgb[..., 2]
    return np.stack(
        [
            r,
            g,
            b,
            r * r,
            g * g,
            b * b,
            r * g,
            r * b,
            g * b,
            np.ones_like(r),
        ],
        axis=-1,
    )


def fit_transform(samples_x: np.ndarray, samples_y: np.ndarray, ridge: float) -> np.ndarray:
    x = features(samples_x)
    xtx = x.T @ x
    xty = x.T @ samples_y
    regularizer = np.eye(xtx.shape[0], dtype=np.float32) * ridge
    regularizer[-1, -1] = 0.0
    return np.linalg.solve(xtx + regularizer, xty)


def apply_transform(rgb: np.ndarray, coeffs: np.ndarray) -> np.ndarray:
    shape = rgb.shape
    flat = rgb.reshape(-1, 3)
    out = features(flat) @ coeffs
    return np.clip(out.reshape(shape), 0.0, 1.0)


def collect_samples(pairs: list[tuple[Path, Path]], max_side: int, samples_per_pair: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    all_x = []
    all_y = []

    for raw_path, target_path in pairs:
        raw = load_rgb(raw_path, max_side=max_side)
        target = load_rgb(target_path, max_side=max_side)
        if target.shape[:2] != raw.shape[:2]:
            target = resize_to(target, (raw.shape[1], raw.shape[0]))

        flat_raw = raw.reshape(-1, 3)
        flat_target = target.reshape(-1, 3)
        count = min(samples_per_pair, len(flat_raw))
        indexes = rng.choice(len(flat_raw), size=count, replace=False)
        all_x.append(flat_raw[indexes])
        all_y.append(flat_target[indexes])

    return np.concatenate(all_x, axis=0), np.concatenate(all_y, axis=0)


def write_cube(path: Path, coeffs: np.ndarray, size: int) -> None:
    with path.open("w", encoding="utf-8") as file:
        file.write("# Glame Magimir learned LUT\n")
        file.write(f"TITLE \"glame_magimir_learned_{size}\"\n")
        file.write(f"LUT_3D_SIZE {size}\n")
        file.write("DOMAIN_MIN 0.0 0.0 0.0\n")
        file.write("DOMAIN_MAX 1.0 1.0 1.0\n")
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    rgb = np.array([r / (size - 1), g / (size - 1), b / (size - 1)], dtype=np.float32)
                    out = apply_transform(rgb.reshape(1, 1, 3), coeffs).reshape(3)
                    file.write(f"{out[0]:.8f} {out[1]:.8f} {out[2]:.8f}\n")


def make_contact_sheet(pairs: list[tuple[Path, Path]], coeffs: np.ndarray, output_path: Path, max_rows: int) -> None:
    rows = []
    thumb_w = 360
    label_h = 34

    for raw_path, target_path in pairs[:max_rows]:
        raw_img = Image.open(raw_path).convert("RGB")
        target_img = Image.open(target_path).convert("RGB")
        raw_img.thumbnail((thumb_w, thumb_w), Image.Resampling.LANCZOS)
        target_img = target_img.resize(raw_img.size, Image.Resampling.LANCZOS)

        raw = np.asarray(raw_img, dtype=np.float32) / 255.0
        predicted = Image.fromarray((apply_transform(raw, coeffs) * 255).astype(np.uint8), "RGB")

        row_h = raw_img.height + label_h
        row = Image.new("RGB", (thumb_w * 3, row_h), "white")
        row.paste(raw_img, (0, label_h))
        row.paste(predicted, (thumb_w, label_h))
        row.paste(target_img, (thumb_w * 2, label_h))
        draw = ImageDraw.Draw(row)
        for index, text in enumerate(("RAW", "LEARNED", "MAGIMIR")):
            draw.text((thumb_w * index + 12, 10), text, fill=(30, 25, 20))
        rows.append(row)

    sheet = Image.new("RGB", (thumb_w * 3, sum(row.height for row in rows)), "white")
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    sheet.save(output_path, quality=95)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", default="dataset/raw")
    parser.add_argument("--target-dir", default="dataset/magimir")
    parser.add_argument("--out-dir", default="outputs/magimir_lut")
    parser.add_argument("--max-side", type=int, default=900)
    parser.add_argument("--samples-per-pair", type=int, default=18000)
    parser.add_argument("--ridge", type=float, default=0.002)
    parser.add_argument("--lut-size", type=int, default=33)
    parser.add_argument("--seed", type=int, default=614)
    args = parser.parse_args()

    raw_dir = Path(args.raw_dir)
    target_dir = Path(args.target_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    pairs = list_pairs(raw_dir, target_dir)
    if not pairs:
        raise SystemExit("No matching raw/target pairs found.")

    x, y = collect_samples(pairs, args.max_side, args.samples_per_pair, args.seed)
    coeffs = fit_transform(x, y, args.ridge)

    np.save(out_dir / "magimir_poly_coeffs.npy", coeffs)
    (out_dir / "magimir_poly_coeffs.json").write_text(
        json.dumps({"coefficients": coeffs.tolist()}, indent=2),
        encoding="utf-8",
    )
    write_cube(out_dir / "glame_magimir_learned.cube", coeffs, args.lut_size)
    make_contact_sheet(pairs, coeffs, out_dir / "comparison_sheet.jpg", max_rows=min(8, len(pairs)))

    metrics = {
        "pair_count": len(pairs),
        "sample_count": int(len(x)),
        "features": ["r", "g", "b", "r2", "g2", "b2", "rg", "rb", "gb", "bias"],
        "ridge": args.ridge,
        "lut_size": args.lut_size,
    }
    (out_dir / "training_report.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
