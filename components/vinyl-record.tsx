/** The disc can be animated independently of its white surround. */
export function VinylRecord() {
  return (
    <div
      className="vinyl-surround"
      role="img"
      aria-label="A black vinyl record with a white Q Audio label"
    >
      <div className="vinyl-tilt">
        <div className="vinyl-record">
          <div className="vinyl-grooves" />
          <div className="vinyl-reflection" />
          <div className="vinyl-runout" />
          <div className="vinyl-label">
            <span className="label-side label-side-left">
              SIDE A<br />
              33⅓ RPM
            </span>
            <span className="label-side label-side-right">
              STEREO
              <br />
              EST. 1973
            </span>
            <span className="label-wordmark">Q AUDIO</span>
            <span className="label-bottom">SOUND, IN ITS PUREST FORM.</span>
            <span className="vinyl-spindle" />
          </div>
        </div>
      </div>
    </div>
  )
}
