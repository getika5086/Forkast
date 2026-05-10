"use client";

import { useEffect, useState } from "react";

type Stage = "reading" | "searching" | "decoding" | "done";

interface Props {
  inputType: "photo" | "screenshot" | "name";
}

const IMAGE_MESSAGES: { stage: Stage; text: string }[] = [
  { stage: "reading", text: "Reading your menu..." },
  { stage: "decoding", text: "Decoding dishes..." },
];

const NAME_MESSAGES: { stage: Stage; text: string }[] = [
  { stage: "searching", text: "Finding the menu..." },
  { stage: "reading", text: "Reading reviews..." },
  { stage: "decoding", text: "Decoding..." },
];

export default function ProgressIndicator({ inputType }: Props) {
  const messages = inputType === "name" ? NAME_MESSAGES : IMAGE_MESSAGES;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= messages.length - 1) return;
    const delay = inputType === "name" ? 6000 : 4000;
    const timer = setTimeout(() => setStep((s) => s + 1), delay);
    return () => clearTimeout(timer);
  }, [step, messages.length, inputType]);

  return (
    <div className="flex flex-col items-center gap-6 py-12">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-orange-100" />
        <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl">🍽️</span>
      </div>

      <div className="text-center space-y-1">
        <p className="text-lg font-semibold text-gray-800">{messages[step].text}</p>
        <p className="text-sm text-gray-400">This takes 10–20 seconds</p>
      </div>

      {inputType === "name" && (
        <div className="flex gap-2 mt-2">
          {NAME_MESSAGES.map((m, i) => (
            <div
              key={m.stage}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                i <= step ? "bg-orange-500 w-8" : "bg-gray-200 w-4"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
