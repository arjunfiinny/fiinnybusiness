"use client";

import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Zap, Star, Rocket, Info, ShieldCheck, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import Navbar from "@/components/Navbar";
import LandingFooter from "@/components/landing/LandingFooter";

// Razorpay types
declare global {
  interface Window {
    Razorpay: any;
  }
}

// Fallback only: the checkout uses the key_id returned by createPaymentOrder,
// so the key the order was created with always matches the key checkout opens
// with (a mismatch fails signature verification after a key rotation).
const RAZORPAY_KEY_ID = "rzp_live_U4gym2XAeWIMGm";

const plans = (cycle: "monthly" | "yearly") => [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    period: "forever",
    monthlyEquiv: null,
    features: [
      "Unlimited Transactions",
      "Smart SMS & Gmail Parsing",
      "Group Expenses & Bill Split",
      "1 Bank / Card manual account",
      "Basic Spending Charts",
    ],
    cta: "Start Free",
    href: "/login",
    payable: false,
    popular: false,
    gradient: "from-slate-500 to-slate-600",
    ring: "ring-slate-100",
    badge: null,
  },
  {
    id: "premium",
    name: "Premium",
    price: cycle === "yearly" ? "₹1,499" : "₹199",
    period: cycle === "yearly" ? "/ year" : "/ month",
    monthlyEquiv: cycle === "yearly" ? "₹125 / month" : null,
    features: [
      "Everything in Free",
      "Ad-free Experience",
      "Fiinny Brain — AI Insights",
      "Data Export (CSV / PDF)",
      "Unlimited Manual Accounts",
      "Monthly Spending Analysis",
      "Budget Alerts & Nudges",
    ],
    cta: "Upgrade to Premium",
    href: null,
    payable: true,
    popular: true,
    gradient: "from-teal-500 to-emerald-600",
    ring: "ring-teal-200",
    badge: cycle === "yearly" ? "SAVE 37%" : "MOST POPULAR",
  },
  {
    id: "pro",
    name: "Pro",
    price: cycle === "yearly" ? "₹2,999" : "₹299",
    period: cycle === "yearly" ? "/ year" : "/ month",
    monthlyEquiv: cycle === "yearly" ? "₹250 / month" : null,
    features: [
      "Everything in Premium",
      "Advanced AI Forecasts",
      "Priority Support",
      "Early Feature Access",
      "Multi-device Realtime Sync",
      "Unlimited Loans & EMI tracking",
    ],
    cta: "Go Pro",
    href: null,
    payable: true,
    popular: false,
    gradient: "from-violet-500 to-purple-700",
    ring: "ring-violet-100",
    badge: "POWER USERS",
  },
];

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function SubscriptionPageClient() {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const [paying, setPaying] = useState<string | null>(null);
  const [successPlan, setSuccessPlan] = useState<string | null>(null);
  const { user } = useAuth?.() ?? { user: null };

  const currentPlans = plans(cycle);

  const handlePay = async (planId: string) => {
    if (!user) {
      window.location.href = "/login";
      return;
    }

    setPaying(planId);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Razorpay failed to load");

      // 1. Create order via Firebase Function
      const createOrder = httpsCallable(functions, "createPaymentOrder");
      const result: any = await createOrder({ plan: planId, cycle });
      const { order_id, amount, key_id } = result.data;

      // 2. Open Razorpay checkout
      const options = {
        key: key_id || RAZORPAY_KEY_ID,
        amount,
        currency: "INR",
        name: "Fiinny",
        description: `${planId.toUpperCase()} Plan — ${cycle}`,
        order_id,
        prefill: {
          email: user.email ?? "",
          contact: user.phoneNumber ?? "",
        },
        theme: { color: "#0d9488" },
        modal: { backdropclose: false },
        handler: async (response: any) => {
          // 3. Verify payment
          const verifyPayment = httpsCallable(functions, "verifyPaymentSignature");
          await verifyPayment({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
            plan: planId,
            cycle,
          });
          setSuccessPlan(planId);
          setPaying(null);
        },
        prefill_contact_country_code: "+91",
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => setPaying(null));
      rzp.open();
    } catch (err: any) {
      console.error("Payment error:", err);
      alert(err?.message ?? "Payment failed. Please try again.");
      setPaying(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-teal-100 selection:text-teal-900 overflow-x-hidden">
      <Navbar />

      {/* Background glows */}
      <div className="fixed top-0 right-0 w-[800px] h-[800px] bg-teal-500/8 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

      <main className="pt-32 pb-32 px-4 sm:px-6 lg:px-8 relative z-10">

        {/* ── Success Banner ── */}
        {successPlan && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 font-bold"
          >
            <ShieldCheck className="w-5 h-5" />
            Payment successful! Welcome to {successPlan.charAt(0).toUpperCase() + successPlan.slice(1)}.
          </motion.div>
        )}

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl mx-auto mb-16 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-bold uppercase tracking-[0.2em] mb-8 border border-teal-100">
            Invest in yourself
          </div>
          <h1 className="text-5xl lg:text-7xl font-black text-slate-900 mb-8 tracking-tight leading-none">
            Simple pricing for <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-emerald-600">
              financial freedom.
            </span>
          </h1>
          <p className="text-xl text-slate-500 leading-relaxed font-medium max-w-2xl mx-auto mb-10">
            Start for free. Upgrade when you&apos;re ready — and secure INR payments via Razorpay.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-white rounded-full p-1.5 border border-slate-200 shadow-lg">
            <button
              onClick={() => setCycle("monthly")}
              className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 ${cycle === "monthly" ? "bg-slate-900 text-white shadow-xl" : "text-slate-500 hover:text-slate-900"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("yearly")}
              className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all duration-300 flex items-center gap-2 ${cycle === "yearly" ? "bg-teal-600 text-white shadow-xl shadow-teal-500/30" : "text-slate-500 hover:text-slate-900"}`}
            >
              Yearly
              <span className="text-[10px] bg-amber-300 text-slate-900 px-1.5 py-0.5 rounded-full uppercase tracking-wide font-black">-37%</span>
            </button>
          </div>
        </motion.div>

        {/* ── Plans Grid ── */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
          {currentPlans.map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: idx * 0.15 }}
              className={`relative rounded-[2.5rem] flex flex-col bg-white border shadow-xl transition-all duration-300 hover:-translate-y-2
                ${plan.popular
                  ? `border-teal-200 shadow-2xl shadow-teal-900/10 ${plan.ring} ring-4 z-10 md:scale-105`
                  : "border-slate-100 shadow-slate-200/50"
                }`}
            >
              {/* Top gradient bar */}
              <div className={`h-1.5 rounded-t-[2.5rem] bg-gradient-to-r ${plan.gradient}`} />

              <div className="p-8 flex flex-col flex-1">
                {/* Badge */}
                {plan.badge && (
                  <div className={`inline-flex items-center self-start gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4 ${plan.popular ? "bg-teal-50 text-teal-700 border border-teal-100" : "bg-violet-50 text-violet-700 border border-violet-100"}`}>
                    {plan.popular ? <Star className="w-2.5 h-2.5 fill-current" /> : <Rocket className="w-2.5 h-2.5" />}
                    {plan.badge}
                  </div>
                )}

                {/* Name + price */}
                <h3 className="text-2xl font-black text-slate-900 mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-slate-900">{plan.price}</span>
                  <span className="text-slate-400 text-sm font-medium">{plan.period}</span>
                </div>
                {plan.monthlyEquiv && (
                  <p className="text-xs text-teal-600 font-bold mb-1">= {plan.monthlyEquiv} billed yearly</p>
                )}
                <p className="text-slate-400 text-xs mt-1 font-medium mb-6">
                  {plan.id === "free" ? "No credit card required" : `Secure payment via Razorpay`}
                </p>

                <div className="w-full h-px bg-slate-100 mb-6" />

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600 font-medium">
                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 mt-0.5 ${plan.popular ? "text-teal-500" : plan.id === "pro" ? "text-violet-500" : "text-slate-300"}`} />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {plan.payable ? (
                  <button
                    onClick={() => handlePay(plan.id)}
                    disabled={paying !== null}
                    className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed
                      ${plan.popular
                        ? "bg-teal-600 hover:bg-teal-700 text-white shadow-lg shadow-teal-200"
                        : "bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200"
                      }`}
                  >
                    {paying === plan.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
                    ) : (
                      <>{plan.id === "premium" ? <Star className="w-4 h-4 fill-current" /> : <Rocket className="w-4 h-4" />} {plan.cta}</>
                    )}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="w-full py-4 rounded-2xl font-bold text-sm bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 transition-all"
                  >
                    <Zap className="w-4 h-4" /> {plan.cta}
                  </Link>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Trust badges ── */}
        <div className="max-w-3xl mx-auto mt-16 flex flex-wrap gap-6 justify-center">
          {[
            { icon: ShieldCheck, text: "256-bit encrypted payment" },
            { icon: Star, text: "Razorpay secure checkout" },
            { icon: Zap, text: "Instant activation after payment" },
          ].map(({ icon: Icon, text }, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-500 font-medium">
              <Icon className="w-4 h-4 text-teal-500" /> {text}
            </div>
          ))}
        </div>

        {/* ── Custom plan ── */}
        <div className="text-center mt-16">
          <p className="text-slate-400 font-medium flex items-center justify-center gap-2">
            <Info className="w-4 h-4" />
            Need a custom plan for your team?{" "}
            <a href="mailto:support@fiinny.com" className="text-teal-600 font-bold hover:underline">Contact us</a>.
          </p>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
