import { BRAND } from "../../../../config/brand";
import { Mark } from "../../ui/house";

/**
 * The conserved rail (v21.1, §7.22): the one sentence, real HTML, anchored by
 * the ladle mark, fixed at the bottom of every route (root layout), solid,
 * never covered, never dismissable. Nothing else lives in it.
 */
export function ConservedBar() {
  return <p className="conserved" role="note"><Mark size={20} /><span>{BRAND.secondLine}</span></p>;
}
