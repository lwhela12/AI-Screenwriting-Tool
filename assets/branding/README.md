# Pica icon

A warm paper surface extending to every edge, with the centered Courier-style wordmark “PICA.”. See `pica-wordmark.md` for the active design's generation prompt. The previous large P is retained as `pica-icon-large-p.png`. The operating system controls the displayed icon size and mask.

`pica-icon-master.png` is the current artwork, edited with the built-in image generation tool. `pica-icon-v1.png` retains the original inset-paper design. Re-export the macOS icon family and browser PNG with `bash mac/build-icons.sh` on macOS. The checked-in exports are used by normal builds, so regeneration is only needed when the artwork changes.

The macOS bundle includes `mac/App/Pica.icns`, referenced by `CFBundleIconFile`. The export script uses Apple's `iconutil` to encode the icon family, including the small sizes used in Finder lists; manually packing PNGs into the small icon slots can produce scrambled app icons. The browser uses `client/public/pica-icon.png`.

## Revision prompt

Edit this Pica icon. Keep the warm off-white finely textured paper and black Courier typewriter uppercase P aesthetic. Make the paper fill the ENTIRE square canvas, fully opaque off-white all the way to all four edges and all four corners: zero outer margin, zero transparent padding, zero dark surround, zero border, zero drop shadow, no inset paper shape. The OS will provide the rounded icon mask. Enlarge the single P dramatically: visible black glyph height 58 percent of total image height, centered optically horizontally and vertically. Authentic regular Courier slab serif capital P, crisp strongly legible strokes with subtle ink texture. Only one P, no other content. Flat front view, beautiful restrained premium stationery. Output square PNG.

## Original generation prompt

Use case: logo-brand. Create a beautiful minimal macOS app icon for Pica, a screenwriting app. A single one-inch square of warm ivory writing paper viewed perfectly front-on, no perspective, on a genuinely transparent background. The square fills 82 percent of the image width, centered, corners only very slightly softened like cut paper, fine barely perceptible paper fibers, quiet natural lighting and very restrained soft contact shadow. On the exact center of the paper is one small black uppercase "P" in regular Courier typewriter type. Critical proportion: the letter is true 12-point Courier relative to a 72-point (one inch) square: font em is one sixth of paper width, actual visible capital glyph height is approximately one tenth of paper width. The P must remain SMALL with abundant beautiful empty paper around it, not a large monogram. Crisp authentic slab serif Courier letterform, near-black ink. No other letters, words, symbols, folds, curled corners, borders, stacked pages, colored tile or ornament. Premium understated tactile stationery, meticulously balanced. Output one square 1024x1024 PNG icon with transparency.
