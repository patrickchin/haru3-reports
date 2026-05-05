import fs from "node:fs";
import path from "node:path";

type Props = {
  screenshot: string;
  alt: string;
  width?: number;
};

/**
 * Renders a screenshot inside an iOS-ish phone frame.
 *
 * If the screenshot file doesn't exist yet (we capture them last via Maestro),
 * we render a labeled placeholder so the layout is honest about what's missing.
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/screenshots/${screenshot}`} alt={alt} />
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
