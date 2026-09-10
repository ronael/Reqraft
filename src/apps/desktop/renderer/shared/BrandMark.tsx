const markUrl = new URL("../assets/brand/reqraft-mark.svg", import.meta.url).href;

/** The landing-page mark, outlined so its rendering never depends on installed fonts. */
export function BrandMark(): React.JSX.Element {
  return <img className="brand-mark" src={markUrl} width={29} height={20} alt="Reqraft" />;
}
