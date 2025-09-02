"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { useCustomIndicatorStore } from "@/store/customIndicatorStore";
import { useIndicatorStore } from "@/store/indicatorStore";

// Simple inline Button (replaceable with shadcn/ui later)
const Button = (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className={`px-2 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-500 ${props.className ?? ""}`}
  />
);

export default function IndicatorEditorPanel() {
  const saveCustom = useCustomIndicatorStore((s) => s.saveCustom);
  const activePanel = useIndicatorStore((s) => s.activePanel);

  const [code, setCode] = useState<string>(
    `// Example: simple SMA
function calculate(bars) {
  const period = 14;
  const result = [];
  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      result.push({ time: bars[i].time, value: null });
    } else {
      const slice = bars.slice(i - period, i);
      const avg = slice.reduce((a, b) => a + b.close, 0) / period;
      result.push({ time: bars[i].time, value: avg });
    }
  }
  return result;
}`
  );

  const handleSave = () => {
    if (!activePanel) {
      alert("Select a chart panel first by clicking inside it.");
      return;
    }

    try {
      // Compile user function from editor code
      // eslint-disable-next-line no-new-func
      const fn = new Function(`${code}; return calculate;`)();
      saveCustom(activePanel, code, fn);
      alert("Custom indicator saved!");
    } catch (err) {
      console.error("Compilation error:", err);
      alert("Invalid code. Check console for details.");
    }
  };

  return (
    <div className="h-[300px] border-t border-gray-700 flex flex-col">
      <div className="flex items-center justify-between px-2 py-1 bg-gray-900 text-white text-xs">
        <span>Custom Indicator Editor</span>
        <Button onClick={handleSave}>Save</Button>
      </div>
      <Editor
        height="100%"
        defaultLanguage="javascript"
        value={code}
        onChange={(val) => setCode(val ?? "")}
        options={{
          fontSize: 13,
          minimap: { enabled: false },
        }}
      />
    </div>
  );
}
