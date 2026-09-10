const markUrl = new URL("../assets/brand/reqraft-mark.svg", import.meta.url).href;

/** The shared geometric mark, with no font or remote asset dependency. */
export function BrandMark(): React.JSX.Element {
  return <img className="brand-mark" src={markUrl} width={20} height={20} alt="Reqraft" />;
}
