import { Loader2 } from "lucide-react";

interface LoadingModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
}

export function LoadingModal({ 
  isOpen, 
  title = "Creating Match", 
  description = "Please wait while we create your match..."
}: LoadingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg p-8 w-full max-w-sm mx-4 shadow-2xl">
        {/* Spinner */}
        <div className="flex justify-center mb-6">
          <div className="relative w-16 h-16">
            <Loader2 className="absolute inset-0 w-full h-full animate-spin text-primary" strokeWidth={1.5} />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-center text-foreground mb-2">
          {title}
        </h2>

        {/* Description */}
        <p className="text-center text-muted-foreground text-sm">
          {description}
        </p>

        {/* Animated dots */}
        <div className="flex justify-center gap-1.5 mt-6">
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}
