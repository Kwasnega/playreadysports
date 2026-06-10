import { ChevronLeft, ChevronRight, ChevronDown, Search, ShoppingBag, Menu, User, Star } from "lucide-react";

export default function Store() {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      {/* Top Banner */}
      <div className="bg-[#0b4d3c] text-white text-[10px] sm:text-[11px] font-bold tracking-[0.1em] py-2.5 flex items-center justify-center relative uppercase">
        <button className="absolute left-4 opacity-70 hover:opacity-100 transition-opacity">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span>Taxes & Duties Covered By Us</span>
        <button className="absolute right-4 opacity-70 hover:opacity-100 transition-opacity">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Header */}
      <header className="px-4 py-4 sm:px-8 flex items-center justify-between bg-white sticky top-0 z-50">
        {/* Left Spacer for centering */}
        <div className="hidden lg:flex flex-1" />

        {/* Center Logo */}
        <div className="flex-1 flex justify-center cursor-pointer">
          <div className="text-center transform -skew-x-12 border-2 border-black px-3 py-1 rounded-full shadow-[2px_2px_0px_rgba(0,0,0,1)] bg-white">
            <h1 className="text-2xl sm:text-3xl font-black italic tracking-tighter uppercase leading-none text-black">
              <span className="block text-left">Joga</span>
              <span className="block text-right ml-4">Bonito</span>
            </h1>
          </div>
        </div>

        {/* Right Icons */}
        <div className="flex-1 flex justify-end items-center gap-5 sm:gap-6">
          {/* Currency Selector (Desktop) */}
          <div className="hidden sm:flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-5 h-3.5 flex flex-col relative overflow-hidden rounded-[1px] border border-gray-200">
              {/* Simplified Ghana flag */}
              <div className="h-1/3 bg-[#ce1126]"></div>
              <div className="h-1/3 bg-[#fcd116] flex items-center justify-center">
                <div className="w-1 h-1 bg-black rounded-full scale-75"></div>
              </div>
              <div className="h-1/3 bg-[#006b3f]"></div>
            </div>
            <span className="text-[11px] font-bold text-gray-800 tracking-wide">USD $</span>
            <ChevronDown className="w-3 h-3 text-gray-600" strokeWidth={3} />
          </div>

          <button aria-label="Profile" className="hover:opacity-70 transition-opacity">
            <User className="w-5 h-5 text-gray-900" strokeWidth={1.5} />
          </button>
          <button aria-label="Search" className="hover:opacity-70 transition-opacity">
            <Search className="w-5 h-5 text-gray-900" strokeWidth={1.5} />
          </button>
          <button aria-label="Cart" className="hover:opacity-70 transition-opacity relative">
            <ShoppingBag className="w-5 h-5 text-gray-900" strokeWidth={1.5} />
          </button>
          <button aria-label="Menu" className="hover:opacity-70 transition-opacity">
            <Menu className="w-6 h-6 text-gray-900" strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="hidden lg:flex justify-center gap-10 py-5 border-t border-gray-100 bg-white">
        {[
          "INTRODUCTION",
          "COLLECTION",
          "MERCH",
          "COLLABS",
        ].map(item => (
          <a key={item} href="#" className="text-[11px] font-medium text-gray-500 tracking-[0.05em] hover:text-black transition-colors">
            {item}
          </a>
        ))}
      </nav>

      {/* Hero Section */}
      <main className="flex-1 w-full relative h-[75vh] sm:h-[80vh] bg-gray-200">
        {/* Image Grid Background */}
        <div className="absolute inset-0 grid grid-cols-1 md:grid-cols-3">
          <div className="relative h-full w-full">
            <img
              src="https://images.unsplash.com/photo-1518063319789-7217e6706b04?q=80&w=1000&auto=format&fit=crop"
              className="w-full h-full object-cover"
              alt="Soccer Model 1"
            />
          </div>
          <div className="relative h-full w-full hidden md:block">
            <img
              src="https://images.unsplash.com/photo-1552318414-df611f72782b?q=80&w=1000&auto=format&fit=crop"
              className="w-full h-full object-cover"
              alt="Soccer Model 2"
            />
          </div>
          <div className="relative h-full w-full hidden md:block">
            <img
              src="https://images.unsplash.com/photo-1508344928928-7165b67de128?q=80&w=1000&auto=format&fit=crop"
              className="w-full h-full object-cover"
              alt="Soccer Model 3"
            />
          </div>
        </div>

        {/* Dark overlay for text contrast */}
        <div className="absolute inset-0 bg-black/20"></div>

        {/* Hero Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <p className="text-white text-[11px] sm:text-sm font-bold tracking-[0.15em] mb-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] uppercase">
            Limited Quantities Available
          </p>
          <h2 className="text-white text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-8 drop-shadow-[0_4px_8px_rgba(0,0,0,0.6)] uppercase">
            WC DROP – NOW LIVE
          </h2>
          <button className="bg-white text-black px-12 py-3.5 text-sm font-bold uppercase tracking-wider hover:bg-gray-100 hover:scale-105 transition-all shadow-[0_4px_14px_rgba(0,0,0,0.25)]">
            Shop Now
          </button>
        </div>
      </main>
    </div>
  );
}
