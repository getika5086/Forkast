import Link from "next/link";

export default function DecodeNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <span className="text-6xl">🍽️</span>
      <h1 className="text-2xl font-bold text-gray-900">Decode not found</h1>
      <p className="text-gray-500 max-w-sm text-sm">
        This decode has expired or doesn&apos;t exist. Decodes are valid for 30 days.
      </p>
      <Link
        href="/"
        className="mt-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors text-sm"
      >
        Decode a new restaurant
      </Link>
    </div>
  );
}
