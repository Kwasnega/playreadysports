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
        <div className="w-16 h-16 border-4 border-foreground rounded-full flex items-center justify-center mb-6">
          <WalletIcon className="w-8 h-8 text-foreground" />
        </div>
        <h1 className="font-display font-black text-3xl tracking-tighter uppercase mb-3 text-center">Wallet Access</h1>
        <p className="text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-8 max-w-[280px] leading-relaxed">
          Sign in to add funds and enable 1-tap join for all matches.
        </p>
        <button
          onClick={() => openAuth("signin")}
          className="w-full max-w-[280px] bg-foreground text-background py-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-transform active:scale-[0.98]"
        >
          Sign In
        </button>
        <button
          onClick={() => nav(-1)}
          className="mt-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          Go Back
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
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-border">
        <div className="max-w-[680px] mx-auto px-5 h-16 flex items-center gap-3">
          <button onClick={() => nav(-1)} className="w-10 h-10 -ml-2 rounded-full border-2 border-transparent hover:border-border flex items-center justify-center transition-colors" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display font-black text-xl tracking-tight uppercase flex-1">Wallet</h1>
        </div>
      </header>

      <div className="max-w-[680px] mx-auto px-5 pt-6 space-y-6">
        {/* Balance Card - Invoice Style */}
        <div className="bg-foreground text-background rounded-2xl p-6 relative overflow-hidden border-2 border-foreground">
          <div className="absolute inset-0 border-[8px] border-background/10 rounded-xl pointer-events-none" />
          <div className="absolute -right-6 -top-6 w-32 h-32 border-[20px] border-background/5 rounded-full pointer-events-none" />
          
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <WalletIcon className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Available Balance</span>
          </div>
          
          <div className="flex items-end gap-1 mb-2">
            <span className="text-3xl font-display font-black leading-none mb-1">₵</span>
            <span className="text-[54px] font-display font-black leading-none tracking-tighter">
              {loading ? "--" : Number(balance || 0).toFixed(2)}
            </span>
          </div>
          
          {error && <div className="mt-4 bg-background text-foreground text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-lg inline-block border border-foreground">Error: {error}</div>}
        </div>

        {/* Top Up Section */}
        <section className="bg-card border-2 border-border rounded-2xl p-5">
            <div className="flex items-center gap-2 border-b-2 border-dashed border-border pb-3 mb-4">
              <Plus className="w-5 h-5 text-foreground" />
              <h2 className="font-display font-black text-lg tracking-tight uppercase">Top Up Funds</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {TOPUP_OPTIONS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => { setSelectedAmount(amt); setCustomAmount(""); }}
                  className={`py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all border-2 ${
                    selectedAmount === amt
                      ? "bg-foreground border-foreground text-background scale-[0.98]"
                      : "bg-background border-border text-foreground hover:border-foreground"
                  }`}
                >
                  ₵{amt}
                </button>
              ))}
            </div>

            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-muted-foreground text-lg">₵</span>
              <input
                type="number"
                min="10"
                value={customAmount}
                onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                placeholder="CUSTOM AMOUNT (MIN 10)"
                className="w-full bg-background rounded-xl border-2 border-border py-4 pl-9 pr-4 text-xs font-black uppercase placeholder:text-muted-foreground focus:border-foreground focus:outline-none transition-colors"
              />
            </div>

            <button
              onClick={handleTopUp}
              disabled={!isAmountValid || toppingUp}
              className="w-full h-14 rounded-full bg-foreground border-2 border-foreground text-background text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-[0.98]"
            >
              {toppingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {toppingUp ? "PROCESSING…" : `ADD ${isAmountValid ? '₵' + (selectedAmount || customAmount) : 'FUNDS'}`}
            </button>
        </section>

        {/* Transactions - Receipt Style */}
        <section className="bg-card border-2 border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b-2 border-border border-dashed bg-secondary/40 flex items-center gap-2">
            <History className="w-4 h-4 text-foreground" />
            <h3 className="font-display font-black text-sm uppercase tracking-tight">Transaction History</h3>
          </div>
          
          <div className="p-5">
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex justify-between items-center pb-4 border-b-2 border-dashed border-border last:border-0 last:pb-0">
                    <div className="space-y-2"><div className="w-24 h-4 bg-secondary rounded" /><div className="w-16 h-3 bg-secondary rounded" /></div>
                    <div className="w-12 h-4 bg-secondary rounded" />
                  </div>
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No transactions recorded</p>
              </div>
            ) : (
              <ul className="space-y-4">
                {transactions.map((tx, idx) => (
                  <li key={tx.id} className={`flex items-center justify-between ${idx !== transactions.length - 1 ? "pb-4 border-b-2 border-dashed border-border" : ""}`}>
                    <div>
                      <p className="font-black uppercase tracking-wide text-xs text-foreground flex items-center gap-1.5 mb-1">
                        {tx.type.replace(/_/g, ' ')}
                        {tx.status === 'completed' && <Check className="w-3.5 h-3.5 text-foreground" />}
                        {tx.status === 'pending' && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
                        {tx.status === 'failed' && <AlertCircle className="w-3.5 h-3.5 text-foreground" />}
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                        {new Date(tx.created_at).toLocaleDateString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {tx.status !== 'completed' && (
                          <span className="border border-muted-foreground px-1 py-0.5 rounded-sm">
                            {tx.status}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className={`font-display font-black text-lg tracking-tighter ${tx.amount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                      {tx.amount > 0 ? "+" : ""}₵{Math.abs(Number(tx.amount || 0)).toFixed(2)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

export default WalletPage;
