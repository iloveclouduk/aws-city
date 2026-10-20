import { useState } from "react";
import {
  grantLookout,
  startConsoleCopilot,
  stopConsoleCopilot,
  submitPrompt,
  type Layout,
} from "@/app/runtime";
import { useCity } from "@/state/store";
import { feel } from "./feedback";
import { Icon } from "./icons";
import { offlineReason } from "./logic";

/**
 * The composer: one row that never crowds the panel. In the side panel, the "Do it in my console" switch above it
 * turns the prompt into the Console Copilot (the agent works in your open AWS console tab).
 */
export function PromptBar({ layout }: { layout: Layout }) {
  const [text, setText] = useState("");
  const [inConsole, setInConsole] = useState(false);
  /** Counts sends; the Send icon re-mounts on each one so its little hop replays. */
  const [sent, setSent] = useState(0);
  const onConsole = useCity(
    (s) => s.focus?.kind === "console" || s.focus?.kind === "console-home",
  );
  const copilotOn = useCity((s) => !!s.copilotTaskId);
  const needsCamera = useCity((s) => s.snap === "needs-permission");
  const offline = useCity((s) => offlineReason(s.backendKind, s.backendStatus));
  const send = () => {
    if (!text.trim() || offline) return;
    feel.send();
    if (inConsole) void startConsoleCopilot(text);
    else submitPrompt(text);
    setText("");
    setSent((n) => n + 1);
  };
  const consoleTip = onConsole
    ? "An agent clicks through your open AWS console tab and explains each step. It asks before changing anything."
    : "An agent clicks through your AWS console tab and explains each step. Open a console tab first.";
  return (
    <>
      {layout === "panel" && (
        // A real switch: a name you can read, its state for screen readers, Space/Enter from the keyboard (a button).
        <button
          type="button"
          role="switch"
          aria-checked={inConsole}
          className={`btn tiny ghost console-btn ${inConsole ? "on" : ""}`}
          title={consoleTip}
          onClick={() => (feel.tap(), setInConsole((v) => !v))}
        >
          <Icon name="console" size={10} />
          <span>Do it in my console</span>
          <span className={`switch ${inConsole ? "on" : ""}`} aria-hidden="true" />
        </button>
      )}
      {/* Say the mode out loud (not only in a tooltip), and why sending is off. */}
      {inConsole && (
        <p className="composer-note on" role="status">
          🖱️ <b>Console Copilot is on.</b> The agent clicks through your AWS
          console tab, and asks before it changes anything.
        </p>
      )}
      {offline && <p className="composer-note">{offline}</p>}
      <form
        className={`composer ${inConsole ? "console-mode" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            inConsole
              ? "What should I do in your console?"
              : "Ask the city to do something…"
          }
          aria-label={
            inConsole
              ? "What should the agent do in your console?"
              : "Ask the city"
          }
        />
        {needsCamera && (
          <button
            type="button"
            className="btn tiny"
            onClick={grantLookout}
            title="Chrome needs your OK before the Lookout can see pages"
          >
            <Icon name="camera" size={10} /> Allow
          </button>
        )}
        {copilotOn && (
          <button
            type="button"
            className="btn tiny warn"
            onClick={() => stopConsoleCopilot("You stopped the Console Copilot.")}
          >
            Stop
          </button>
        )}
        <button
          className="btn icon primary send"
          type="submit"
          disabled={!text.trim() || !!offline}
          title={offline ?? "Send"}
          aria-label="Send"
        >
          <span key={sent} className={sent ? "hop" : undefined}>
            <Icon name="send" />
          </span>
        </button>
      </form>
    </>
  );
}
