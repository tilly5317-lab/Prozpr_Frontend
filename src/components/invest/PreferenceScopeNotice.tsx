import InfoPopup, { DIRECTIONAL_TARGET, PopupText } from "@/components/invest/InfoPopup";

/**
 * What a saved distribution does and does not change — behind a small ⓘ
 * beside the screen's subtitle, opened as a pop-up when the customer asks.
 *
 * Also where the Today bar owns up to what it leaves out (ELSS and the like):
 * the surprising part is the rescale, not the omission — those figures were
 * inflated to fill the gap.
 *
 * The planning warnings it used to list (emergency fund, loan offset) are left
 * out for now, although the backend still sends `carve_outs_at_risk`.
 */
export default function PreferenceScopeNotice({
  excludedPct,
}: {
  /** Share of today's holdings the Today bar leaves out; 0 when none, or no Today bar. */
  excludedPct: number;
}) {
  return (
    <InfoPopup
      label="How your preference works"
      title="You set the split. We still pick the funds."
      lead="Your preference replaces the allocation we'd have chosen for you. Which funds go into each slot, and when to switch them, stays with us."
    >
      <PopupText>{DIRECTIONAL_TARGET}</PopupText>
      {excludedPct > 0 ? (
        <PopupText>
          {`Today leaves out the ${excludedPct.toFixed(0)}% of your holdings this plan doesn't cover, such as ELSS (tax-saver) funds. The rest is scaled to 100%.`}
        </PopupText>
      ) : null}
    </InfoPopup>
  );
}
