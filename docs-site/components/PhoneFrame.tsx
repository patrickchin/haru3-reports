import fs from "node:fs";
import path from "node:path";
import Image from "next/image";

type Props = {
  screenshot: string;
  alt: string;
  width?: number;
};

// Native screenshot dimensions (iPhone 16 Pro simulator). Used to reserve
// aspect ratio so the layout doesn't shift when the image finally loads.
const NATIVE_W = 1206;
const NATIVE_H = 2622;

/**
 * Renders a screenshot inside an iOS-ish phone frame.
 *
 * - Uses next/image so Vercel serves optimized WebP/AVIF from its CDN.
 * - Reserves the slot via explicit width/height so there's no layout shift
 *   when the image loads in.
 * - If the screenshot file doesn't exist yet (we capture them last via
 *   Maestro), renders a labeled placeholder of the same aspect ratio.
 */
export function PhoneFrame({ screenshot, alt, width = 280 }: Props) {
  const publicPath = path.join(
    process.cwd(),
    "public",
    "screenshots",
    screenshot,
  );
  const exists = fs.existsSync(publicPath);

  return (
    <div className="h3-phone" style={{ width }}>
      {exists ? (
        <Image
          src={`/screenshots/${screenshot}`}
          alt={alt}
          width={NATIVE_W}
          height={NATIVE_H}
          sizes={`${width}px`}
          className="block h-auto w-full rounded-[26px] bg-secondary"
          // First screenshot on a page is likely above-the-fold; let the
          // browser fetch it eagerly. Others lazy-load by default.
          loading="lazy"
        />
      ) : (
        <div className="h3-phone-empty">
          Screenshot pending
          <br />
          <span className="mt-1 block normal-case tracking-normal text-[10px] font-normal opacity-70">
            {screenshot}
          </span>
        </div>
      )}
    </div>
  );
}
