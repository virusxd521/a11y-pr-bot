// Intentionally inaccessible component — synthetic demo data only.
// Used to exercise a11y-pr-bot end to end. Do not "fix" these violations.
import React from "react";

export function SignupCard() {
  return (
    <section>
      {/* alt-text: image has no alt */}
      <img src="/logo.png" />

      {/* heading-has-content: empty heading */}
      <h2></h2>

      {/* label-has-associated-control: label not wired to an input */}
      <label>Email address</label>
      <input type="email" autoFocus />

      {/* click-events-have-key-events + no-static-element-interactions */}
      <div onClick={() => console.log("submit")}>Submit</div>

      {/* anchor-is-valid + non-descriptive link text (semantic, LLM-only) */}
      <a href="#">click here</a>

      {/* tabindex-no-positive */}
      <button tabIndex={3}>Next</button>

      {/* status conveyed by color alone (semantic, LLM-only) */}
      <span style={{ color: "red" }}>Failed</span>
    </section>
  );
}
