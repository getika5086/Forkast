"use client";

interface Props {
  error: string;
  onRetry?: () => void;
  onFallbackToName?: () => void;
}

const ERROR_CONFIG: Record<
  string,
  { title: string; message: string; action?: string }
> = {
  image_parse_fail: {
    title: "Couldn't read this menu",
    message: "We couldn't read enough of this menu. Try a clearer photo, or search by restaurant name instead.",
    action: "Try name search instead",
  },
  not_found: {
    title: "Restaurant not found",
    message: "We couldn't find a menu for this restaurant. Check the spelling or try a different city.",
  },
  timeout: {
    title: "Taking longer than usual",
    message: "This search is taking longer than expected. Please try again.",
  },
  decode_failed: {
    title: "Something went wrong",
    message: "We hit an unexpected error. Please try again in a moment.",
  },
};

export default function ErrorState({ error, onRetry, onFallbackToName }: Props) {
  const config = ERROR_CONFIG[error] ?? ERROR_CONFIG.decode_failed;

  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="text-5xl">😕</span>
      <div className="space-y-1">
        <p className="text-lg font-semibold text-gray-800">{config.title}</p>
        <p className="text-sm text-gray-500 max-w-sm">{config.message}</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3 mt-2">
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl transition-colors text-sm"
          >
            Try again
          </button>
        )}
        {config.action && onFallbackToName && (
          <button
            onClick={onFallbackToName}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
          >
            {config.action}
          </button>
        )}
      </div>
    </div>
  );
}
