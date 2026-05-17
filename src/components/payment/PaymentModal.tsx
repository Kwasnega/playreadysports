import { X, Shield, Lock, Wallet, CreditCard, RotateCcw } from "lucide-react";
import { useState } from "react";

interface PaymentModalProps {
  open: boolean;
  matchName: string;
  matchCode: string;
  entryFee: number;
  walletBalance?: number;
  onPay: () => void;
  onPayWithWallet?: () => void;
  onClose: () => void;
}

export function PaymentModal({ open, matchName, matchCode, entryFee, walletBalance = 0, onPay, onPayWithWallet, onClose }: PaymentModalProps) {
  const [paying, setPaying] = useState(false);
  const canUseWallet = walletBalance >= entryFee && !!onPayWithWallet;

  if (!open) return null;

  const handleCardPay = () => {
    setPaying(true);
    onPay();
  };

  const handleWalletPay = () => {
    setPaying(true);
    onPayWithWallet?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card w-full max-w-[420px] sm:rounded-3xl rounded-t-3xl p-6 space-y-5 border border-border/60"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-lg tracking-tight">Confirm payment</h2>
            <p className="text-muted-foreground text-xs">{matchName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Match details */}
        <div className="bg-secondary/40 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Match code</span>
            <span className="font-mono font-semibold text-sm">{matchCode}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Entry fee</span>
            <span className="font-semibold text-sm">₵{entryFee}/player</span>
          </div>
          <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-1">
            <span className="text-sm font-medium">Total</span>
            <span className="font-display font-bold text-lg">₵{entryFee}</span>
          </div>
        </div>

        {/* Escrow notice */}
        <div className="flex items-start gap-2.5 bg-amber-500/5 rounded-xl p-3 border border-amber-500/10">
          <Lock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            This amount is held securely until match day. Refunded automatically if the match is cancelled.
          </p>
        </div>

        {/* Cancellation policy */}
        <div className="flex items-start gap-2.5 bg-secondary/50 rounded-xl p-3 border border-border/40">
          <RotateCcw className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">Cancellation policy:</span>{" "}
            Full refund if you leave more than 2 hours before kick-off. Within 2 hours, the entry fee is non-refundable.
          </p>
        </div>

        {/* Paystack badge */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Shield className="w-3.5 h-3.5 text-emerald-500" />
          <span>Secured by Paystack</span>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          {canUseWallet && (
            <button
              onClick={handleWalletPay}
              disabled={paying}
              className="w-full bg-emerald-500 text-white font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Wallet className="w-4 h-4" />
              {paying ? "Processing…" : `Pay ₵${entryFee} from wallet`}
            </button>
          )}
          <button
            onClick={handleCardPay}
            disabled={paying}
            className={`w-full font-semibold rounded-full px-4 py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60 ${
              canUseWallet ? "bg-secondary text-foreground" : "bg-foreground text-background"
            }`}
          >
            <CreditCard className="w-4 h-4" />
            {paying ? "Opening checkout…" : `Pay ₵${entryFee} with card`}
          </button>
          <button
            onClick={onClose}
            className="w-full bg-secondary text-muted-foreground font-semibold rounded-full px-4 py-3.5 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
