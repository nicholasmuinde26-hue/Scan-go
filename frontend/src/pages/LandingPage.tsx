import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Smartphone,
  ShieldCheck,
  Zap,
  ShoppingBag,
  ShoppingCart,
  Building2,
  Clock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Barcode,
  Receipt,
  Server,
  UserCheck,
} from 'lucide-react';
import { ScanGoLogo } from '../components/ScanGoLogo.js';
import { apiRequest } from '../api.js';

export const LandingPage: React.FC = () => {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [branchCountEstimate, setBranchCountEstimate] = useState(2);
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setErrorMsg(null);
      await apiRequest('/onboarding/request-access', {
        method: 'POST',
        body: JSON.stringify({
          companyName,
          contactName,
          contactEmail,
          contactPhone,
          branchCountEstimate,
          location,
          notes,
        }),
      });
      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-navy-700">
      {/* Top Navbar */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3">
            <ScanGoLogo size="md" />
          </Link>
          <div className="flex items-center space-x-4">
            <a
              href="#for-supermarkets"
              className="text-xs font-bold text-slate-600 hover:text-navy-800 transition hidden sm:inline"
            >
              For Supermarkets
            </a>
            <Link
              to="/staff"
              className="text-xs font-bold text-slate-600 hover:text-navy-800 transition flex items-center space-x-1"
            >
              <span>Staff Portal</span>
            </Link>
            <Link
              to="/login"
              className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-xs flex items-center space-x-1.5"
            >
              <span>Shop Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24 bg-gradient-to-b from-azure-50 via-white to-brand-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            <div className="inline-flex items-center space-x-2 bg-brand-50 border border-brand-200 text-brand-800 px-3 py-1 rounded-full text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smarter supermarket shopping, built for Kenya</span>
            </div>
            <h1 className="text-5xl sm:text-7xl font-extrabold text-navy-700 tracking-tight leading-tight">
              Scan. Pay. Verify. <span className="text-brand-500">Go.</span>
            </h1>
            <p className="text-base sm:text-lg text-navy-600 leading-relaxed font-normal">
              Faster exits. Better retail experiences. Skip the Friday-evening queue: scan items as you shop, pay with
              M-Pesa, and walk out with a target exit time of just 30–60 seconds.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                to="/register"
                className="w-full sm:w-auto bg-brand-600 hover:bg-brand-700 text-white font-bold px-8 py-3.5 rounded-2xl transition shadow-lg shadow-brand-600/20 text-sm flex items-center justify-center space-x-2"
              >
                <span>Create Shopper Account</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto bg-white hover:bg-azure-50 text-navy-700 font-bold px-8 py-3.5 rounded-2xl border border-navy-200 transition text-sm flex items-center justify-center"
              >
                Shopper Sign In
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-8 max-w-xl mx-auto">
              {[
                { icon: Barcode, top: 'Scan', bottom: 'Products' },
                { icon: Smartphone, top: 'Pay with', bottom: 'M-Pesa' },
                { icon: ShieldCheck, top: 'Verify', bottom: 'at Exit' },
                { icon: Zap, top: 'Go!', bottom: '' },
              ].map((s) => (
                <div key={s.top} className="flex flex-col items-center space-y-2">
                  <div className="w-14 h-14 rounded-full bg-brand-700 text-white flex items-center justify-center shadow-md">
                    <s.icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-bold text-navy-700 leading-tight text-center">
                    {s.top}
                    {s.bottom && <br />}
                    {s.bottom}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* One account, two ways to shop */}
      <section className="py-16 bg-white border-y border-navy-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy-700">One account. Two ways to shop.</h2>
            <p className="text-sm text-navy-500">
              Scan &amp; Go in-store, or Shop &amp; Collect online. Same account, same M-Pesa checkout.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-brand-50 p-7 rounded-3xl border border-brand-200 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center">
                <ShoppingCart className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-extrabold text-navy-700">SCAN &amp; GO</h3>
              <p className="text-xs font-bold text-brand-700 tracking-wide">Scan · Pay · Verify · Go</p>
              <p className="text-xs text-navy-500 leading-relaxed">
                Shop in-store with ease. Scan products with your phone, pay and leave through a dedicated Scan &amp; Go lane.
              </p>
            </div>

            <div className="bg-azure-600 p-7 rounded-3xl space-y-3 text-white">
              <div className="w-12 h-12 rounded-2xl bg-white/15 text-white flex items-center justify-center">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-extrabold">SHOP &amp; COLLECT</h3>
              <p className="text-xs font-bold text-azure-100 tracking-wide">Order · Pay · Collect</p>
              <p className="text-xs text-azure-100 leading-relaxed">
                Order ahead, collect at your convenience. Store staff pick and pack, and you collect using a QR code or OTP.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-16 bg-azure-50/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy-700">Shop in-store with ease.</h2>
            <p className="text-sm text-navy-500">Five items shouldn&apos;t mean five minutes in a queue.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { n: 1, icon: Barcode, title: 'Scan products', body: 'Point your phone camera at items as you pick them and watch your digital trolley update with live shelf prices.' },
              { n: 2, icon: Smartphone, title: 'Pay using M-Pesa', body: 'Approve the M-Pesa STK push on your phone. Your payment is confirmed automatically.' },
              { n: 3, icon: Receipt, title: 'Present a digital receipt', body: 'Show your single-use digital receipt QR at the exit lane.' },
              { n: 4, icon: ShieldCheck, title: 'Complete exit check', body: 'Store staff independently verify your items and you are on your way.' },
            ].map((s) => (
              <div key={s.n} className="bg-white p-6 rounded-3xl border border-navy-100 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-full bg-navy-700 text-white flex items-center justify-center font-bold text-sm">
                    {s.n}
                  </div>
                  <s.icon className="w-6 h-6 text-brand-600" />
                </div>
                <h3 className="text-base font-bold text-navy-700">{s.title}</h3>
                <p className="text-xs text-navy-500 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-8">
            <div className="inline-flex items-center space-x-2 bg-brand-50 border border-brand-200 text-brand-800 px-4 py-2 rounded-full text-xs font-bold">
              <Clock className="w-4 h-4" />
              <span>Target: 30–60 seconds to exit</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trust and fraud controls */}
      <section className="py-16 bg-white border-y border-navy-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-navy-700">Convenience with store-side controls.</h2>
            <p className="text-sm text-navy-500">Trust and fraud controls are built into every trip.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: Server, title: 'Server-Side Pricing', body: 'Prices are calculated by the server, never trusted from the phone.', tint: 'bg-azure-50 text-azure-600' },
              { icon: Receipt, title: 'Single-Use Receipts', body: 'Redeemed receipts cannot be reused.', tint: 'bg-brand-100 text-brand-700' },
              { icon: UserCheck, title: 'Exit Verification', body: 'Staff independently check items at the exit.', tint: 'bg-azure-50 text-azure-600' },
            ].map((c) => (
              <div key={c.title} className="bg-azure-50/60 p-6 rounded-3xl border border-navy-100 text-center space-y-3">
                <div className={`w-12 h-12 rounded-2xl ${c.tint} flex items-center justify-center mx-auto`}>
                  <c.icon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-navy-700">{c.title}</h3>
                <p className="text-xs text-navy-500 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Supermarkets / B2B Section */}
      <section id="for-supermarkets" className="py-20 bg-navy-700 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center space-x-2 bg-navy-800/70 border border-navy-400/40 text-navy-200 px-3 py-1 rounded-full text-xs font-bold">
                <Building2 className="w-3.5 h-3.5" />
                <span>Supermarket Chains &amp; Retailers</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                A line-free exit, not a second queue.
              </h2>
              <p className="text-sm text-navy-200 leading-relaxed">
                Reduce checkout congestion at peak hours and free up checkout capacity. Scan &amp; Go gives your stores
                dedicated lanes, risk-based auditing, fast exception handling and Shop &amp; Collect pick-and-pack
                stations, starting in Machakos and ready to expand regionally.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {['Dedicated Scan & Go Lanes', 'Risk-Based Auditing', 'Fast Exception Handling', 'Shop & Collect Picking App'].map(
                  (f) => (
                    <div key={f} className="flex items-center space-x-2 bg-navy-800/60 p-3 rounded-xl border border-navy-500/40">
                      <CheckCircle2 className="w-4 h-4 text-brand-400 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ),
                )}
              </div>

              <div>
                <button
                  onClick={() => setIsRequestModalOpen(true)}
                  className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-6 py-3.5 rounded-2xl text-xs transition shadow-lg flex items-center space-x-2"
                >
                  <span>Request Retailer Onboarding</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="bg-navy-800/50 p-6 sm:p-8 rounded-3xl border border-navy-500/40 space-y-6">
              <h3 className="text-base font-bold text-navy-100">Onboarding Process</h3>
              <div className="space-y-4 text-xs text-navy-200">
                {[
                  { t: 'Submit Retail Application', d: 'Submit your supermarket branch count and location details.' },
                  { t: 'Enterprise Review & Provisioning', d: 'Our platform administrators provision your dedicated workspace and branches.' },
                  { t: 'Single-Use Invite Onboarding', d: 'Supermarket owners receive secure single-use invitation links to configure store staff and launch.' },
                ].map((s, i) => (
                  <div key={s.t} className="flex items-start space-x-3">
                    <div className="w-6 h-6 rounded-full bg-navy-600 text-brand-400 flex items-center justify-center font-bold text-[11px] shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <strong className="text-white block">{s.t}</strong>
                      {s.d}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy-950 text-navy-300 text-xs py-8 border-t border-navy-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <ScanGoLogo size="sm" subtitle={false} tone="onDark" />
            <p>© {new Date().getFullYear()} Scan &amp; Go. Smarter supermarket shopping. Kenya Data Protection Act Compliant.</p>
          </div>
          <div className="flex space-x-6 text-navy-200">
            <Link to="/staff" className="hover:text-white transition">
              Staff Portal
            </Link>
            <Link to="/login" className="hover:text-white transition">
              Customer Sign In
            </Link>
          </div>
        </div>
      </footer>

      {/* Supermarket Request Access Modal */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-navy-50 text-navy-700 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-navy-800 text-base">Request Supermarket Onboarding</h3>
                  <p className="text-xs text-slate-500">Our enterprise team will review and onboard your chain</p>
                </div>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-6 space-y-3">
                <CheckCircle2 className="w-12 h-12 text-brand-600 mx-auto" />
                <h4 className="font-bold text-navy-800">Application Received</h4>
                <p className="text-xs text-slate-500">
                  Thank you! Our operations team has received your details and will contact {contactPhone} with your
                  onboarding workspace link.
                </p>
                <button
                  onClick={() => {
                    setIsRequestModalOpen(false);
                    setSubmitted(false);
                  }}
                  className="bg-navy-800 text-white text-xs font-bold px-6 py-2.5 rounded-xl mt-2"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequestAccess} className="space-y-3.5 text-xs">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 text-rose-700 rounded-xl border border-rose-200">{errorMsg}</div>
                )}
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Supermarket / Retail Chain Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cleanshelf Supermarkets"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Contact Person *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. John Mwangi"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Contact Phone *</label>
                    <input
                      type="tel"
                      required
                      placeholder="e.g. 0722000000"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Contact Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="hq@cleanshelf.co.ke"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Branch Count (Estimate)</label>
                    <input
                      type="number"
                      min={1}
                      value={branchCountEstimate}
                      onChange={(e) => setBranchCountEstimate(Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Headquarter Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mombasa Road, Nairobi"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRequestModalOpen(false)}
                    className="px-4 py-2 font-bold text-slate-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-navy-600 hover:bg-navy-700 text-white font-bold px-5 py-2 rounded-xl disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
