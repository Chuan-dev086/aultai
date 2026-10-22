const STEPS = [
  { id: "explore", n: 1, label: "Explore" },
  { id: "diagnose", n: 2, label: "Diagnose" },
  { id: "review", n: 3, label: "Review" },
  { id: "test", n: 4, label: "Test" },
  { id: "verify", n: 5, label: "Verify" },
];

/**
 * DemoStepper — guided 5-step demo navigation in the top bar.
 * @param {object} props
 * @param {string} props.activeStep Current step id.
 * @param {(stepId: string) => void} props.onStepClick Step click handler.
 * @returns {import("react").JSX.Element} The stepper.
 */
export default function DemoStepper({ activeStep, onStepClick }) {
  return (
    <nav aria-label="Demo steps" className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((s, i) => (
        <span key={s.id} className="flex items-center gap-1">
          {i > 0 && <span className="text-slate-700">›</span>}
          <button
            type="button"
            onClick={() => onStepClick(s.id)}
            className={`flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs ${
              activeStep === s.id
                ? "bg-indigo-700 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <span className="font-mono">{s.n}</span>
            {s.label}
          </button>
        </span>
      ))}
    </nav>
  );
}
