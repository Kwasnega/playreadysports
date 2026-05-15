import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Wallet as WalletIcon, Plus, History, Check, Loader2,
  AlertCircle,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useAuth } from "@/hooks/useAuth";

const TOPUP_OPTIONS = [20, 50, 100, 200];

const WalletPage = () => {
  const nav = useNavigate();
  const { user, openAuth } = useAuth();
  const { balance, transactions, loading, toppingUp, error, topUp } = useWallet();
  const [customAmount, setCustomAmount] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);

  if (!user) {
    return (
      <main className="min-h-screen bg-background pb-10 flex flex-col items-center justify-center px-5">
        <WalletIcon className="w-12 h-12 text-muted-foreground mb-4" />
        <h1 className="font-display font-bold text-2xl tracking-tight mb-2">Sign in to view wallet</h1>
        <p className="text-center text-muted-foreground text-sm mb-6 max-w-[280px]">
          You need an account to add funds and use 1-tap join for matches.
        </p>
        <button
          onClick={() => openAuth("signin")}
          className="bg-foreground text-background font-bold rounded-full px-6 py-3 transition-transform active:scale-95"
        >
          Sign in
        </button>
        <button
          onClick={() => nav(-1)}
          className="mt-4 text-sm font-semibold text-muted-foreground"
        >
          Go back
        </button>
      </main>
    );
  }

  const handleTopUp = async () => {
    const amount = selectedAmount || Number(customAmount);
    if (!amount || amount < 10) return;
    
    await topUp(amount);
  };

  const isAmountValid = (selectedAmount || Number(customAmount)) >= 10;

  return (
    <main className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b border-border/60">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <button onClick={() => nav(-1)} className="p-2 -ml-2 rounded-full hover:bg-secondary" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-bold text-xl tracking-tight flex-1">Wallet</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 pt-6 space-y-8">
        {/* Balance Card */}
        <div className="bg-foreground text-background rounded-3xl p-6 relative overflow-hidden shadow-2xl">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-background/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-2 text-background/80 mb-2">
            <WalletIcon className="w-5 h-5" />
            <span className="font-semibold text-sm">Available Balance</span>
          </div>
          
          <div className="flex items-end gap-1">
            <span className="text-3xl font-display font-bold leading-none mb-1">₵</span>
            <span className="text-[54px] font-display font-extrabold leading-none tracking-tight">
              {loading ? "--" : balance.toFixed(2)}
            </span>
          </div>
          
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </div>

        {/* Top Up Section */}
        <section>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {TOPUP_OPTIONS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => { setSelectedAmount(amt); setCustomAmount(""); }}
                  className={`py-3 rounded-2xl font-bold transition-all ${
                    selectedAmount === amt
                      ? "bg-foreground text-background ring-2 ring-foreground ring-offset-2 ring-offset-background"
                      : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}
                >
                  ₵{amt}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">₵</span>
                <input
                  type="number"
                  min="10"
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                  placeholder="Custom amount (Min ₵10)"
                  className="w-full bg-secondary rounded-2xl py-3 pl-8 pr-4 font-bold outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-2 focus:ring-offset-background transition-all"
                />
              </div>
            </div>

            <button
              onClick={handleTopUp}
              disabled={!isAmountValid || toppingUp}
              className="w-full h-14 bg-foreground text-background rounded-full font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {toppingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              {toppingUp ? "Processing..." : `Top Up ${isAmountValid ? '₵' + (selectedAmount || customAmount) : ''}`}
            </button>
        </section>

        {/* Transactions */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Recent Transactions
            </h3>
          </div>
          
          {loading ? (
            <div className="animate-pulse space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex justify-between items-center">
                  <div className="space-y-2"><div className="w-24 h-4 bg-secondary rounded" /><div className="w-16 h-3 bg-secondary rounded" /></div>
                  <div className="w-12 h-4 bg-secondary rounded" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border/60 rounded-3xl">
              <p className="text-muted-foreground text-sm">No transactions yet.</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {transactions.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold capitalize text-foreground flex items-center gap-1.5">
                      {tx.type.replace('_', ' ')}
                      {tx.status === 'completed' && <Check className="w-3 h-3 text-emerald-500" />}
                      {tx.status === 'pending' && <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />}
                      {tx.status === 'failed' && <AlertCircle className="w-3 h-3 text-red-500" />}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {tx.status !== 'completed' && (
                        <span className={`ml-1.5 text-[10px] font-bold uppercase tracking-wider ${
                          tx.status === 'pending' ? 'text-amber-600' : 'text-red-500'
                        }`}>
                          {tx.status}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className={`font-bold tabular-nums ${tx.amount > 0 ? "text-emerald-500" : "text-foreground"}`}>
                    {tx.amount > 0 ? "+" : ""}₵{Math.abs(tx.amount).toFixed(2)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
};

export default WalletPage;
