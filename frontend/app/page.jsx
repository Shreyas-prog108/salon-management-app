'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="font-sans text-stone-900 bg-stone-50 antialiased min-h-screen selection:bg-amber-100 selection:text-amber-900 overflow-x-hidden">
      {/* 1. PREMIUM NAVBAR */}
      <nav className={`fixed w-full z-50 transition-all duration-500 ${scrolled ? 'bg-white/80 backdrop-blur-2xl border-b border-stone-200/50 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.04)]' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center gap-3 cursor-pointer group">
              <div className="w-10 h-10 bg-stone-950 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform duration-500 border border-stone-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {/* Scissor / Barber Icon */}
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
                </svg>
              </div>
              <span className={`font-serif font-bold text-2xl tracking-tight transition-colors duration-500 ${scrolled ? 'text-stone-950' : 'text-white'}`}>Baalbar.</span>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-2">
              <a href="#features" className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${scrolled ? 'text-stone-600 hover:text-stone-950 hover:bg-stone-100' : 'text-stone-300 hover:text-white hover:bg-white/10'}`}>Features</a>
              <a href="#how-it-works" className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${scrolled ? 'text-stone-600 hover:text-stone-950 hover:bg-stone-100' : 'text-stone-300 hover:text-white hover:bg-white/10'}`}>Experience</a>
              <div className={`w-px h-4 mx-2 transition-colors duration-500 ${scrolled ? 'bg-stone-300' : 'bg-white/20'}`} />
              <Link href="/auth/login" className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${scrolled ? 'text-stone-600 hover:text-stone-950' : 'text-stone-300 hover:text-white'}`}>Sign in</Link>
              <Link href="/book" className="ml-2 group relative inline-flex items-center justify-center gap-2 rounded-full bg-stone-950 px-6 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-stone-800 hover:shadow-xl active:scale-95 border border-stone-800">
                Book Now
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION - Editorial / High-End Vibe */}
      <section className="relative pt-36 pb-24 lg:pt-48 lg:pb-32 overflow-hidden bg-stone-950">
        {/* Cinematic Background Image */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-stone-950/80 mix-blend-multiply z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/50 to-transparent z-10" />
          <img src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=2000&q=80" alt="Barbershop" className="w-full h-full object-cover opacity-50 scale-105 animate-[pulse_20s_ease-in-out_infinite_alternate]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8 text-center z-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-stone-300 text-xs font-semibold uppercase tracking-widest mb-8 backdrop-blur-md animate-[fadeInUp_0.8s_ease-out_forwards]">
            <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></span>
            The Premium Salon OS
          </div>
          
          <h1 className="text-5xl md:text-7xl lg:text-[6rem] font-serif text-white tracking-tight leading-[1.05] mb-8 animate-[fadeInUp_0.8s_ease-out_0.1s_forwards] opacity-0" style={{ animationFillMode: 'forwards' }}>
            Elevate your <br className="hidden md:block"/>
            <span className="italic text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-stone-100 to-amber-200 font-light">craft & clientele.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-stone-400 max-w-2xl mx-auto mb-10 animate-[fadeInUp_0.8s_ease-out_0.2s_forwards] opacity-0 font-light" style={{ animationFillMode: 'forwards' }}>
            The operating system for master barbers and elite salons. Streamline bookings, manage your roster, and deliver a white-glove experience.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-[fadeInUp_0.8s_ease-out_0.3s_forwards] opacity-0" style={{ animationFillMode: 'forwards' }}>
            <Link href="/auth/login" className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-sm font-bold text-stone-950 shadow-lg transition-all hover:bg-stone-200 hover:scale-[1.02] active:scale-95">
              Start your legacy
            </Link>
            <a href="#demo" className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white/5 border border-white/20 px-8 py-4 text-sm font-bold text-white backdrop-blur-md transition-all hover:bg-white/10 active:scale-95 hover:border-white/40">
              View the lookbook
            </a>
          </div>
        </div>
      </section>

      {/* 3. LOGO CLOUD - Luxury Edition */}
      <section className="py-16 bg-stone-50 border-b border-stone-200/50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <p className="text-xs font-bold text-stone-400 mb-10 uppercase tracking-[0.2em]">Trusted by the world's finest establishments</p>
          <div className="flex flex-wrap justify-center items-center gap-12 lg:gap-24 opacity-60 grayscale hover:grayscale-0 transition-all duration-1000">
            <h3 className="text-2xl font-serif italic text-stone-900">Blind Barber</h3>
            <h3 className="text-xl font-sans font-black text-stone-900 tracking-[0.3em]">FELLOW</h3>
            <h3 className="text-2xl font-serif text-stone-900">Ruffians</h3>
            <h3 className="text-xl font-sans font-bold text-stone-900 tracking-widest border-y border-stone-900 py-1">BYRD</h3>
            <h3 className="text-3xl font-serif italic font-light text-stone-900">Baxter</h3>
          </div>
        </div>
      </section>

            {/* 4. EDITORIAL BENTO GRID */}
      <section id="features" className="py-32 bg-stone-50 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-20">
            <h2 className="text-4xl md:text-5xl font-serif font-medium text-stone-950 tracking-tight mb-6">Designed for the modern shop.</h2>
            <p className="text-lg text-stone-500 font-light leading-relaxed">We replaced the clunky, outdated software of the past with a beautiful, lightning-fast platform that respects your brand's aesthetic.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 auto-rows-[340px]">
            
            {/* Large Feature 1 - Image Background + Glass UI */}
            <div className="md:col-span-2 md:row-span-2 rounded-[2.5rem] overflow-hidden relative group shadow-[0_20px_40px_rgba(0,0,0,0.06)] border border-stone-200/50 flex flex-col justify-end">
              <div className="absolute inset-0 bg-stone-950">
                {/* Changed to a highly reliable Unsplash URL for barber tools/shop */}
                <img src="https://images.unsplash.com/photo-1593702275687-f8b402bf1fb5?auto=format&fit=crop&w=1200&q=80" alt="Barber Tools" className="w-full h-full object-cover opacity-50 group-hover:scale-105 transition-all duration-1000" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-transparent"></div>
              
              {/* Floating Mock UI to fill the empty space */}
              <div className="absolute top-10 right-10 w-64 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-4 shadow-2xl hidden sm:block transform group-hover:-translate-y-2 transition-transform duration-700">
                <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
                  <span className="text-white text-sm font-medium">Select Time</span>
                  <span className="text-amber-400 text-xs font-bold">TODAY</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-white text-stone-950 text-center py-2 rounded-lg text-sm font-semibold shadow-sm">1:00 PM</div>
                  <div className="bg-white/10 text-stone-300 text-center py-2 rounded-lg text-sm border border-white/20 hover:bg-white hover:text-stone-950 transition-colors cursor-pointer">1:30 PM</div>
                  <div className="bg-white/10 text-stone-300 text-center py-2 rounded-lg text-sm border border-white/20 hover:bg-white hover:text-stone-950 transition-colors cursor-pointer">2:15 PM</div>
                  <div className="bg-white/10 text-stone-300 text-center py-2 rounded-lg text-sm border border-white/20 hover:bg-white hover:text-stone-950 transition-colors cursor-pointer">3:00 PM</div>
                </div>
                <div className="w-full bg-amber-500 text-stone-950 text-center py-2.5 rounded-lg text-sm font-bold shadow-md">
                  Confirm $45
                </div>
              </div>

              <div className="absolute bottom-0 left-0 p-10 md:p-12 w-full z-10">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white mb-6">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                </div>
                <h3 className="text-3xl md:text-4xl font-serif text-white mb-4">White-Glove Booking.</h3>
                <p className="text-stone-300 max-w-lg font-light text-lg leading-relaxed">A seamless 24/7 digital concierge for your clients. Beautifully branded to your shop, incredibly fast, and completely frictionless.</p>
              </div>
            </div>

            {/* Small Feature 1 - Master Roster Image */}
            <div className="md:row-span-1 rounded-[2.5rem] overflow-hidden relative group shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-stone-200/60">
              <div className="absolute inset-0 bg-stone-950">
                 <img src="https://images.unsplash.com/photo-1605497788044-5a32c7078486?auto=format&fit=crop&w=800&q=80" alt="Master Barber" className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-all duration-1000" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-transparent"></div>
              <div className="absolute bottom-0 left-0 p-8 w-full">
                <h3 className="text-2xl font-serif text-white mb-2">Master Roster</h3>
                <p className="text-stone-300 font-light text-sm leading-relaxed">Empower your barbers with individual schedules and service times.</p>
              </div>
            </div>

            {/* Small Feature 2 - Walk-in Flow Image */}
            <div className="md:row-span-1 rounded-[2.5rem] overflow-hidden relative group shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-stone-200/60">
               <div className="absolute inset-0 bg-stone-950">
                 <img src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?auto=format&fit=crop&w=800&q=80" alt="Barber Pole" className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-all duration-1000" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-transparent"></div>
              <div className="absolute bottom-0 left-0 p-8 w-full">
                <h3 className="text-2xl font-serif text-white mb-2">Walk-in Flow</h3>
                <p className="text-stone-300 font-light text-sm leading-relaxed">A digital waiting room that seamlessly weaves walk-ins into the calendar.</p>
              </div>
            </div>
            
            {/* Wide Feature - Analytics with lifestyle background */}
            <div className="md:col-span-3 bg-white rounded-[2.5rem] border border-stone-200/60 shadow-[0_8px_30px_rgb(0,0,0,0.03)] overflow-hidden relative group flex flex-col md:flex-row min-h-[400px]">
              {/* Left Side: Content */}
              <div className="flex-1 p-10 md:p-14 z-10 flex flex-col justify-center bg-white md:bg-transparent md:bg-gradient-to-r md:from-white md:via-white/95 md:to-transparent">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-100 border border-stone-200 text-stone-600 text-xs font-bold uppercase tracking-widest mb-6 w-max">
                  Analytics
                </div>
                <h3 className="text-3xl md:text-4xl font-serif text-stone-950 mb-4 leading-tight">Know your shop's <br/>pulse in real-time.</h3>
                <p className="text-stone-500 font-light text-lg max-w-md mb-0">Track daily revenue, identify your busiest hours, and monitor staff performance through beautifully designed dashboards that make sense of the noise.</p>
              </div>
              
              {/* Right Side: Image + Glass Chart */}
              <div className="flex-1 relative min-h-[300px] md:min-h-full">
                <div className="absolute inset-0 bg-stone-950 hidden md:block">
                    <img src="https://images.unsplash.com/photo-1512496015851-a1cbf4c560f4?auto=format&fit=crop&w=1200&q=80" alt="Shop Interior" className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-all duration-1000" />
                </div>
                <div className="absolute inset-0 bg-gradient-to-r from-white via-transparent to-transparent hidden md:block"></div>
                
                {/* Floating Glass Chart Overlay */}
                <div className="absolute right-8 top-1/2 -translate-y-1/2 w-[90%] max-w-sm rounded-2xl bg-white/70 backdrop-blur-xl border border-white/50 p-6 shadow-[0_20px_40px_rgba(0,0,0,0.12)]">
                   <div className="mb-6">
                     <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Today's Revenue</div>
                     <div className="text-3xl font-serif text-stone-950">$2,450.00</div>
                   </div>
                   <div className="flex items-end gap-2 h-24 w-full">
                     <div className="w-full bg-stone-300/80 rounded-t-sm h-[30%]"></div>
                     <div className="w-full bg-stone-300/80 rounded-t-sm h-[50%]"></div>
                     <div className="w-full bg-stone-900 rounded-t-sm h-[90%] shadow-lg relative">
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-stone-950 text-white text-[10px] py-1 px-2 rounded font-bold">Peak</div>
                     </div>
                     <div className="w-full bg-stone-300/80 rounded-t-sm h-[70%]"></div>
                     <div className="w-full bg-stone-300/80 rounded-t-sm h-[40%]"></div>
                     <div className="w-full bg-stone-300/80 rounded-t-sm h-[60%]"></div>
                     <div className="w-full bg-stone-300/80 rounded-t-sm h-[80%]"></div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4.5 HOW IT WORKS (Premium redesign) */}
      <section id="how-it-works" className="py-32 bg-stone-950 relative overflow-hidden border-t border-stone-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
          <div className="text-center mb-24 max-w-2xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-serif text-white tracking-tight mb-6">The Client Experience.</h2>
            <p className="text-lg text-stone-400 font-light">A booking flow so refined, it sets the tone before they even walk through the door.</p>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-[1px] bg-stone-800"></div>

            <div className="grid md:grid-cols-3 gap-16 relative">
              {/* Step 1 */}
              <div className="relative flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center mb-8 relative z-10 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:-translate-y-2 transition-transform duration-500">
                  <span className="text-3xl font-serif text-white">01</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-4 tracking-wide uppercase text-sm">Select Service</h3>
                <p className="text-stone-400 font-light text-base max-w-[280px] leading-relaxed">Clients browse your curated menu and select their preferred master barber or stylist.</p>
              </div>

              {/* Step 2 */}
              <div className="relative flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center mb-8 relative z-10 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:-translate-y-2 transition-transform duration-500">
                  <span className="text-3xl font-serif text-amber-400 italic">02</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-4 tracking-wide uppercase text-sm">Secure the Time</h3>
                <p className="text-stone-400 font-light text-base max-w-[280px] leading-relaxed">Live availability is synced instantly, offering friction-free scheduling without the back-and-forth.</p>
              </div>

              {/* Step 3 */}
              <div className="relative flex flex-col items-center text-center group">
                <div className="w-24 h-24 rounded-full bg-stone-900 border border-stone-800 flex items-center justify-center mb-8 relative z-10 shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:-translate-y-2 transition-transform duration-500">
                  <span className="text-3xl font-serif text-white">03</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-4 tracking-wide uppercase text-sm">Instant Confirmation</h3>
                <p className="text-stone-400 font-light text-base max-w-[280px] leading-relaxed">Appointments are locked in with automated, beautifully branded reminders sent directly to their phone.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. EDITORIAL CTA */}
      <section className="py-32 bg-stone-50 relative border-t border-stone-200">
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-multiply"></div>
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center relative z-10">
          <div className="w-16 h-16 bg-stone-950 rounded-2xl mx-auto flex items-center justify-center text-white mb-10 shadow-2xl rotate-3">
             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
          </div>
          <h2 className="text-5xl md:text-6xl font-serif text-stone-950 mb-8 leading-tight">Ready to elevate <br/><span className="italic font-light">your establishment?</span></h2>
          <p className="text-xl text-stone-500 mb-12 font-light max-w-2xl mx-auto">Join the new standard of salon management. Start your 14-day trial today, no credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/auth/login" className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-stone-950 px-10 py-5 text-sm font-bold text-white shadow-xl transition-all hover:bg-stone-800 hover:scale-[1.02] active:scale-95 border border-stone-900">
              Upgrade Your Shop
            </Link>
            <a href="#demo" className="w-full sm:w-auto inline-flex items-center justify-center rounded-full bg-white border border-stone-200 px-10 py-5 text-sm font-bold text-stone-900 shadow-sm transition-all hover:bg-stone-50 active:scale-95 hover:border-stone-300">
              Contact Concierge
            </a>
          </div>
        </div>
      </section>

      {/* 6. CLEAN FOOTER */}
      <footer className="bg-white py-16 border-t border-stone-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-stone-950 rounded-lg flex items-center justify-center text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg>
              </div>
              <span className="font-serif font-bold text-xl text-stone-950 tracking-tight">Baalbar.</span>
            </div>
            
            <div className="flex gap-8 text-sm font-medium text-stone-400 uppercase tracking-wider">
              <a href="#" className="hover:text-stone-950 transition-colors">Instagram</a>
              <a href="#" className="hover:text-stone-950 transition-colors">Twitter</a>
              <a href="#" className="hover:text-stone-950 transition-colors">Support</a>
              <a href="#" className="hover:text-stone-950 transition-colors">Terms</a>
            </div>
            
            <p className="text-sm text-stone-400 font-light">© 2026 Baalbar Inc. Crafted for the finest.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
