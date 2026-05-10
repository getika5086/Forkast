"use client";

import { useState } from "react";

interface Props {
  onSearch: (name: string, city: string) => void;
  disabled?: boolean;
}

export default function NameSearch({ onSearch, disabled }: Props) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !city.trim()) return;
    onSearch(name.trim(), city.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl pointer-events-none">🍽️</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Restaurant name"
          required
          disabled={disabled}
          className="w-full pl-11 pr-4 py-4 text-base rounded-2xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:opacity-50 bg-white"
        />
      </div>

      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl pointer-events-none">📍</span>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
          required
          disabled={disabled}
          className="w-full pl-11 pr-4 py-4 text-base rounded-2xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:opacity-50 bg-white"
        />
      </div>

      <button
        type="submit"
        disabled={disabled || !name.trim() || !city.trim()}
        className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200 disabled:cursor-not-allowed text-white disabled:text-gray-400 font-semibold text-base rounded-2xl transition-colors"
      >
        Decode this restaurant
      </button>
    </form>
  );
}
